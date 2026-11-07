from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_employee, get_db
from app.core import analytics_math
from app.crud import analytics as crud_analytics
from app.crud import car_model as crud_car_model
from app.crud import part as crud_part
from app.crud.order import cancel_expired_orders
from app.schemas.analytics import (
    AnalyticsBestSellersResponse,
    CarModelsResponse,
    DemandForecastResponse,
    PartAnalyticsOut,
    SalesByMonthResponse,
    StockoutRiskResponse,
    StockResponse,
)

# Todas las rutas de este router son solo para vendedores (empleados): la
# dependencia a nivel de router la heredan los endpoints que se agreguen.
router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_employee)],
)

# Con 5 unidades o menos un repuesto se marca como stock bajo. Es el mismo
# corte que usa scripts.seed_order_history para los repuestos en riesgo.
STOCK_BAJO = 5


def today() -> date:
    # Dependencia aparte para que los tests fijen el día.
    return analytics_math.today_in_uruguay()


# Filtros del dashboard (HU 5.9), iguales en todos los endpoints.
def _category():
    return Query(None, max_length=60, description="Solo los repuestos de esta categoría (exacta, sin distinguir mayúsculas).")


def _search():
    return Query(None, max_length=100, description="Solo los repuestos cuyo nombre o código contiene este texto.")


def _months(default_value: int | None):
    return Query(
        default_value,
        ge=1,
        le=24,
        description="Últimos N meses calendario, el actual incluido (sus ventas son hasta hoy).",
    )


@router.get("/ping")
def ping():
    # El dashboard lo usa al iniciar sesión para confirmar que el token es
    # de un vendedor antes de pedir los datos.
    return {"status": "ok"}


@router.get("/stock", response_model=StockResponse)
def stock(
    low_stock_threshold: int = Query(
        STOCK_BAJO,
        ge=0,
        le=1000,
        description="Con esta cantidad o menos, el repuesto se marca como stock bajo.",
    ),
    category: Optional[str] = _category(),
    search: Optional[str] = _search(),
    db: Session = Depends(get_db),
):
    # El stock reservado por pedidos vencidos vuelve antes de mostrarlo.
    cancel_expired_orders(db)
    parts = crud_part.list_stock(db, category=category, search=search)
    return {
        "low_stock_threshold": low_stock_threshold,
        "parts": [
            {
                "id": part.id,
                "part_code": part.part_code,
                "name": part.name,
                "manufacturer": part.manufacturer,
                "category": part.category,
                "stock": part.stock,
                "low_stock": part.stock <= low_stock_threshold,
            }
            for part in parts
        ],
    }


@router.get("/best-sellers", response_model=AnalyticsBestSellersResponse)
def best_sellers(
    limit: int = Query(10, ge=1, le=100, description="Cantidad de repuestos a devolver."),
    days: Optional[int] = Query(
        None,
        ge=1,
        le=3650,
        description="Contar solo las ventas de los últimos N días. Sin valor: todas.",
    ),
    months: Optional[int] = _months(None),
    category: Optional[str] = _category(),
    search: Optional[str] = _search(),
    today_date: date = Depends(today),
    db: Session = Depends(get_db),
):
    # Con `months` se cuentan meses calendario enteros, igual que en la
    # evolución de ventas, así el ranking y el gráfico hablan del mismo período.
    since = None
    if months is not None:
        since = analytics_math.month_start(analytics_math.last_months(today_date, months)[0])

    # A diferencia de la tienda, incluye los que hoy no tienen stock: un más
    # vendido agotado es justo lo que hay que reponer.
    rows = crud_part.list_best_sellers(
        db, limit=limit, days=days, since=since, category=category, search=search
    )
    return {
        "days": days,
        "months": months,
        "parts": [
            {
                "id": part.id,
                "part_code": part.part_code,
                "name": part.name,
                "manufacturer": part.manufacturer,
                "category": part.category,
                "stock": part.stock,
                "units_sold": units_sold,
            }
            for part, units_sold in rows
        ],
    }


def _months_with_sales(db: Session, today_date: date, qty: int, **filters) -> list[dict]:
    periods = analytics_math.last_months(today_date, qty)
    sales = crud_analytics.list_sales(db, since=analytics_math.month_start(periods[0]), **filters)
    by_month = analytics_math.group_by_month(((when, u, f) for _, when, u, f in sales), periods)
    by_month[-1]["in_progress"] = True
    return by_month


def _forecast(by_month: list[dict], today_date: date) -> dict:
    # Regresión sobre los últimos 12 meses de la serie, con el mes en
    # curso llevado a mes completo.
    ultimos = [period["units"] for period in by_month[-analytics_math.FORECAST_MONTHS:]]
    units = analytics_math.proyectar(analytics_math.complete_current_month(ultimos, today_date))
    period = analytics_math.next_month((today_date.year, today_date.month))
    return {"month": analytics_math.month_text(period), "units": units}


@router.get("/sales-by-month", response_model=SalesByMonthResponse)
def sales_by_month(
    months: int = _months(12),
    category: Optional[str] = _category(),
    search: Optional[str] = _search(),
    part_id: Optional[int] = Query(None, ge=1, description="Solo las ventas de este repuesto."),
    today_date: date = Depends(today),
    db: Session = Depends(get_db),
):
    # Unidades y facturación de cada mes (HU 5.4), y la proyección del mes
    # que viene para el mismo conjunto de repuestos (HU 5.5). La proyección
    # siempre mira 12 meses, aunque se muestren menos.
    by_month = _months_with_sales(
        db,
        today_date,
        max(months, analytics_math.FORECAST_MONTHS),
        category=category,
        search=search,
        part_id=part_id,
    )
    return {"months": by_month[-months:], "projection": _forecast(by_month, today_date)}


@router.get("/demand-forecast", response_model=DemandForecastResponse)
def demand_forecast(
    limit: int = Query(20, ge=1, le=2000, description="Cantidad de repuestos a devolver."),
    category: Optional[str] = _category(),
    search: Optional[str] = _search(),
    today_date: date = Depends(today),
    db: Session = Depends(get_db),
):
    # Demanda proyectada del mes que viene por repuesto, de mayor a menor.
    period, result_rows = crud_analytics.forecasts(db, today_date, category=category, search=search)
    result_rows.sort(key=lambda row: (-row.projected_units, row.part.part_code, row.part.id))
    return {
        "month": analytics_math.month_text(period),
        "parts": [
            {
                "id": row.part.id,
                "part_code": row.part.part_code,
                "name": row.part.name,
                "manufacturer": row.part.manufacturer,
                "category": row.part.category,
                "stock": row.part.stock,
                "units_last_12_months": sum(row.units_by_month),
                "projected_units": row.projected_units,
            }
            for row in result_rows[:limit]
        ],
    }


@router.get("/stockout-risk", response_model=StockoutRiskResponse)
def stockout_risk(
    at_risk_only: bool = Query(False, description="Solo los de riesgo alto o medio (las alertas de reposición)."),
    category: Optional[str] = _category(),
    search: Optional[str] = _search(),
    today_date: date = Depends(today),
    db: Session = Depends(get_db),
):
    cancel_expired_orders(db)
    period, result_rows = crud_analytics.forecasts(db, today_date, category=category, search=search)
    if at_risk_only:
        result_rows = [row for row in result_rows if row.risk != analytics_math.LOW_RISK]

    # Del más urgente al menos urgente: primero por nivel. Dentro de cada
    # nivel, los que dejarían más unidades sin cubrir el mes que viene; si
    # no, un agotado que vende 0,3 por mes taparía a uno que vende 50 y le
    # quedan 6 días. Después, los que se agotan antes; sin demanda, al final.
    result_rows.sort(
        key=lambda row: (
            analytics_math.RISK_ORDER[row.risk],
            -max(row.projected_units - row.part.stock, 0),
            row.coverage_days is None,
            row.coverage_days or 0,
            row.part.part_code,
            row.part.id,
        )
    )
    return {
        "month": analytics_math.month_text(period),
        "thresholds": {
            "high_below": analytics_math.HIGH_RISK_DAYS,
            "medium_up_to": analytics_math.MEDIUM_RISK_DAYS,
        },
        "parts": [
            {
                "id": row.part.id,
                "part_code": row.part.part_code,
                "name": row.part.name,
                "manufacturer": row.part.manufacturer,
                "category": row.part.category,
                "stock": row.part.stock,
                "projected_units": row.projected_units,
                "daily_demand": row.daily_demand,
                "coverage_days": row.coverage_days,
                "risk": row.risk,
            }
            for row in result_rows
        ],
    }


@router.get("/parts/{part_id}", response_model=PartAnalyticsOut)
def part_detail(
    part_id: int,
    today_date: date = Depends(today),
    db: Session = Depends(get_db),
):
    # Todo lo del dashboard sobre un repuesto (HU 5.8): stock, ventas de los
    # últimos 12 meses, proyección y riesgo.
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repuesto no encontrado.")

    period, (row,) = crud_analytics.forecasts(db, today_date, part_id=part_id)
    return {
        "id": part.id,
        "part_code": part.part_code,
        "name": part.name,
        "manufacturer": part.manufacturer,
        "category": part.category,
        "price": part.price,
        "stock": part.stock,
        "low_stock": part.stock <= STOCK_BAJO,
        "units_sold": crud_analytics.units_sold_total(db, part_id),
        "months": _months_with_sales(db, today_date, analytics_math.FORECAST_MONTHS, part_id=part_id),
        "projection": {"month": analytics_math.month_text(period), "units": row.projected_units},
        "daily_demand": row.daily_demand,
        "coverage_days": row.coverage_days,
        "risk": row.risk,
    }


@router.get("/car-models", response_model=CarModelsResponse)
def car_models(db: Session = Depends(get_db)):
    # Para elegir los vehículos compatibles en el alta de repuestos (HU 5.10).
    return {
        "car_models": [
            {"id": m.id, "brand": m.brand, "model": m.model, "engine_code": m.engine_code}
            for m in crud_car_model.list_car_models(db)
        ]
    }
