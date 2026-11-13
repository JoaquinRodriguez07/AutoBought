"""Preguntarle al dashboard (HU 6.4): POST /analytics/preguntar y las herramientas que puede usar la IA."""

import logging
import re
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationInfo, model_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_employee, get_db
from app.api.v1.endpoints import analytics
from app.core import analytics_math
from app.core.config import AI_ASK_HOURLY_LIMIT
from app.crud import part as crud_part
from app.ia import ask_dashboard as ai_ask
from app.ia.ask_dashboard import InvalidToolCall, Tool, ToolResult
from app.ia.client import AIClient, AIUnavailable, get_ai_client
from app.ia.service import check_limit, record_usage
from app.models.employee import Employee
from app.schemas.analytics import AskDashboardIn, AskDashboardOut

# Mismo prefijo y misma regla que el resto del dashboard: solo vendedores.
router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_employee)],
)

logger = logging.getLogger(__name__)

# Cómo queda anotado en uso_ia.funcionalidad.
ASK_FEATURE = "pregunta_dashboard"
ASK_UNAVAILABLE = "No pudimos responder ahora. El resto del dashboard funciona igual; probá de nuevo en un rato."
ASK_LIMIT_REACHED = "Llegaste al límite de preguntas por hora. Probá de nuevo en un rato."

RISK_TEXT = {
    analytics_math.HIGH_RISK: "Alto",
    analytics_math.MEDIUM_RISK: "Medio",
    analytics_math.LOW_RISK: "Bajo",
}


# --- Parámetros de las herramientas ---
# Los mismos límites que los Query de los endpoints de análisis. Un
# parámetro de más, o fuera de rango, rechaza el pedido de la IA.

Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Search = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Months = Annotated[int, Field(ge=1, le=24)]
Limit = Annotated[int, Field(ge=1, le=ai_ask.MAX_ROWS)]
MonthText = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


def _months_back(today_date: date, month: str) -> int:
    """Cuántos meses calendario hay que mirar para incluir `month`
    ("AAAA-MM"), contando el actual: 1 es el mes en curso; 0 o menos, un
    mes futuro."""
    year, number = (int(part) for part in re.match(r"(\d{4})-(\d{2})", month).groups())
    return (today_date.year - year) * 12 + today_date.month - number + 1


class _Params(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class FilterParams(_Params):
    categoria: Optional[Category] = None
    busqueda: Optional[Search] = None


class SalesParams(FilterParams):
    meses: Months = 12


class CategorySalesParams(_Params):
    meses: Months = 12
    mes: Optional[MonthText] = None

    @model_validator(mode="after")
    def _recent_month(self, info: ValidationInfo):
        # El día de hoy llega en el contexto de la validación (ver
        # ia.ask_dashboard.validate_calls).
        if self.mes and info.context and not 1 <= _months_back(info.context["today"], self.mes) <= 24:
            raise ValueError(f"El mes {self.mes} no está entre los últimos 24 meses.")
        return self


class BestSellersParams(FilterParams):
    meses: Months = 12
    limite: Limit = 10


class StockParams(FilterParams):
    solo_stock_bajo: bool = False
    limite: Limit = 20


class ForecastParams(FilterParams):
    limite: Limit = 10


class RiskParams(FilterParams):
    solo_en_riesgo: bool = True
    limite: Limit = 10


def build_tools(db: Session, today_date: date) -> dict[str, Tool]:
    """Las herramientas que puede pedir la IA. Cada una llama a un endpoint
    de análisis (los mismos números que ve el vendedor en el dashboard) con
    los parámetros ya validados, y arma la tabla que sustenta la respuesta."""

    def sales_by_month(p: SalesParams) -> ToolResult:
        body = analytics.sales_by_month(
            months=p.meses, category=p.categoria, search=p.busqueda, part_id=None, today_date=today_date, db=db
        )
        rows = [
            [f"{m['month']} (en curso)" if m.get("in_progress") else m["month"], m["units"], m["revenue"]]
            for m in body["months"]
        ]
        return ToolResult(
            columns=["Mes", "Unidades", "Facturación ($)"],
            rows=rows,
            extra={"proyeccion_mes_siguiente": body["projection"]},
        )

    def sales_by_category(p: CategorySalesParams) -> ToolResult:
        # Un sales-by-month por categoría, con los mismos meses calendario.
        months = _months_back(today_date, p.mes) if p.mes else p.meses
        rows = []
        for category, _ in crud_part.list_categories(db):
            body = analytics.sales_by_month(
                months=months, category=category, search=None, part_id=None, today_date=today_date, db=db
            )
            periods = body["months"][:1] if p.mes else body["months"]
            rows.append([category, sum(m["units"] for m in periods), sum(m["revenue"] for m in periods)])
        rows.sort(key=lambda row: (-row[1], row[0]))
        period = p.mes or f"últimos {months} meses (el actual, hasta hoy)"
        return ToolResult(columns=["Categoría", "Unidades", "Facturación ($)"], rows=rows, extra={"periodo": period})

    def best_sellers(p: BestSellersParams) -> ToolResult:
        body = analytics.best_sellers(
            limit=p.limite,
            days=None,
            months=p.meses,
            category=p.categoria,
            search=p.busqueda,
            today_date=today_date,
            db=db,
        )
        return ToolResult(
            columns=["Código", "Repuesto", "Categoría", "Unidades vendidas", "Stock"],
            rows=[[r["part_code"], r["name"], r["category"], r["units_sold"], r["stock"]] for r in body["parts"]],
            extra={"periodo": f"últimos {p.meses} meses (el actual, hasta hoy)"},
        )

    def stock(p: StockParams) -> ToolResult:
        body = analytics.stock(
            low_stock_threshold=analytics.STOCK_BAJO, category=p.categoria, search=p.busqueda, db=db
        )
        parts = body["parts"]
        shown = [r for r in parts if r["low_stock"]] if p.solo_stock_bajo else parts
        return ToolResult(
            columns=["Código", "Repuesto", "Categoría", "Stock"],
            rows=[[r["part_code"], r["name"], r["category"], r["stock"]] for r in shown[: p.limite]],
            extra={
                "repuestos": len(parts),
                "sin_stock": sum(r["stock"] == 0 for r in parts),
                "stock_bajo": sum(r["low_stock"] for r in parts),
                "umbral_stock_bajo": body["low_stock_threshold"],
            },
        )

    def demand_forecast(p: ForecastParams) -> ToolResult:
        body = analytics.demand_forecast(
            limit=p.limite, category=p.categoria, search=p.busqueda, today_date=today_date, db=db
        )
        return ToolResult(
            columns=["Código", "Repuesto", "Stock", "Vendidas en 12 meses", f"Proyección {body['month']}"],
            rows=[
                [r["part_code"], r["name"], r["stock"], r["units_last_12_months"], r["projected_units"]]
                for r in body["parts"]
            ],
            extra={"mes_proyectado": body["month"]},
        )

    def stockout_risk(p: RiskParams) -> ToolResult:
        body = analytics.stockout_risk(
            at_risk_only=p.solo_en_riesgo, category=p.categoria, search=p.busqueda, today_date=today_date, db=db
        )
        parts = body["parts"]
        return ToolResult(
            columns=["Código", "Repuesto", "Stock", "Demanda proyectada", "Días de cobertura", "Riesgo"],
            rows=[
                [
                    r["part_code"],
                    r["name"],
                    r["stock"],
                    r["projected_units"],
                    "Sin demanda" if r["coverage_days"] is None else r["coverage_days"],
                    RISK_TEXT[r["risk"]],
                ]
                for r in parts[: p.limite]
            ],
            extra={
                "mes_proyectado": body["month"],
                "riesgo_alto_menos_de_dias": body["thresholds"]["high_below"],
                "riesgo_medio_hasta_dias": body["thresholds"]["medium_up_to"],
                "repuestos_riesgo_alto": sum(r["risk"] == analytics_math.HIGH_RISK for r in parts),
                "repuestos_riesgo_medio": sum(r["risk"] == analytics_math.MEDIUM_RISK for r in parts),
            },
        )

    filters = 'categoria (una de las categorías), busqueda (texto del nombre o código del repuesto)'
    tools = [
        Tool(
            "ventas_por_mes",
            f"unidades y facturación de cada mes, y la proyección del mes siguiente; {filters}, meses (1 a 24, por defecto 12).",
            SalesParams,
            sales_by_month,
        ),
        Tool(
            "ventas_por_categoria",
            "unidades y facturación de cada categoría, de mayor a menor; mes (\"AAAA-MM\", un solo mes) "
            "o meses (1 a 24, los últimos N meses; por defecto 12).",
            CategorySalesParams,
            sales_by_category,
        ),
        Tool(
            "mas_vendidos",
            f"ranking de repuestos por unidades vendidas; {filters}, meses (1 a 24, por defecto 12), "
            f"limite (1 a {ai_ask.MAX_ROWS}, por defecto 10).",
            BestSellersParams,
            best_sellers,
        ),
        Tool(
            "stock",
            f"stock actual de los repuestos, de menos a más; {filters}, solo_stock_bajo (true/false: "
            f"{analytics.STOCK_BAJO} unidades o menos), limite (1 a {ai_ask.MAX_ROWS}, por defecto 20).",
            StockParams,
            stock,
        ),
        Tool(
            "proyeccion_demanda",
            f"demanda proyectada del mes que viene por repuesto, de mayor a menor; {filters}, "
            f"limite (1 a {ai_ask.MAX_ROWS}, por defecto 10).",
            ForecastParams,
            demand_forecast,
        ),
        Tool(
            "riesgo_agotamiento",
            f"días de cobertura y riesgo de quedarse sin stock, del más urgente al menos urgente (qué reponer); "
            f"{filters}, solo_en_riesgo (true/false, por defecto true: solo riesgo alto o medio), "
            f"limite (1 a {ai_ask.MAX_ROWS}, por defecto 10).",
            RiskParams,
            stockout_risk,
        ),
    ]
    return {tool.name: tool for tool in tools}


@router.post("/preguntar", response_model=AskDashboardOut)
def ask_dashboard(
    body: AskDashboardIn,
    today_date: date = Depends(analytics.today),
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
    ai_client: AIClient = Depends(get_ai_client),
):
    # Cada pregunta cuenta para el límite por hora del vendedor (429) y
    # queda en uso_ia, salga bien o mal, igual que el resumen.
    check_limit(
        db,
        employee.user_id,
        limit_value=AI_ASK_HOURLY_LIMIT,
        detail=ASK_LIMIT_REACHED,
        hours=1,
        funcionalidad=ASK_FEATURE,
    )
    categories = [category for category, _ in crud_part.list_categories(db)]
    try:
        result = ai_ask.answer(ai_client, body.question, today_date, categories, build_tools(db, today_date))
    except AIUnavailable as error:
        # Incluye InvalidToolCall. El motivo queda en el log; al vendedor le
        # llega un aviso genérico.
        level = logging.ERROR if isinstance(error, InvalidToolCall) else logging.WARNING
        logger.log(level, "Pregunta al dashboard sin responder: %s", error)
        record_usage(db, employee.user_id, ASK_FEATURE, tokens=0, ok=False)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=ASK_UNAVAILABLE)

    record_usage(db, employee.user_id, ASK_FEATURE, tokens=result.tokens, ok=True)
    data = result.data
    return {
        "answer": result.answer,
        "data": {"columns": data.columns, "rows": data.rows} if data else None,
    }
