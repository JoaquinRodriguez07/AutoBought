from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_employee, get_db
from app.core import analitica
from app.crud import analytics as crud_analytics
from app.crud import car_model as crud_car_model
from app.crud import part as crud_part
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


def fecha_de_hoy() -> date:
    # Dependencia aparte para que los tests fijen el día.
    return analitica.hoy_en_uruguay()


# Filtros del dashboard (HU 5.9), iguales en todos los endpoints.
def _categoria():
    return Query(None, max_length=60, description="Solo los repuestos de esta categoría (exacta, sin distinguir mayúsculas).")


def _busqueda():
    return Query(None, max_length=100, description="Solo los repuestos cuyo nombre o código contiene este texto.")


def _meses(por_defecto: int | None):
    return Query(
        por_defecto,
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
    category: Optional[str] = _categoria(),
    search: Optional[str] = _busqueda(),
    db: Session = Depends(get_db),
):
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
    months: Optional[int] = _meses(None),
    category: Optional[str] = _categoria(),
    search: Optional[str] = _busqueda(),
    hoy: date = Depends(fecha_de_hoy),
    db: Session = Depends(get_db),
):
    # Con `months` se cuentan meses calendario enteros, igual que en la
    # evolución de ventas, así el ranking y el gráfico hablan del mismo período.
    since = None
    if months is not None:
        since = analitica.inicio_del_mes(analitica.ultimos_meses(hoy, months)[0])

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


def _meses_con_ventas(db: Session, hoy: date, cantidad: int, **filtros) -> list[dict]:
    meses = analitica.ultimos_meses(hoy, cantidad)
    ventas = crud_analytics.list_sales(db, since=analitica.inicio_del_mes(meses[0]), **filtros)
    por_mes = analitica.agrupar_por_mes(((fecha, u, f) for _, fecha, u, f in ventas), meses)
    por_mes[-1]["in_progress"] = True
    return por_mes


def _proyeccion(por_mes: list[dict], hoy: date) -> dict:
    # Regresión sobre los últimos 12 meses de la serie, con el mes en
    # curso llevado a mes completo.
    ultimos = [mes["units"] for mes in por_mes[-analitica.MESES_PROYECCION:]]
    unidades = analitica.proyectar(analitica.completar_mes_en_curso(ultimos, hoy))
    mes = analitica.mes_siguiente((hoy.year, hoy.month))
    return {"month": analitica.texto_mes(mes), "units": unidades}


@router.get("/sales-by-month", response_model=SalesByMonthResponse)
def sales_by_month(
    months: int = _meses(12),
    category: Optional[str] = _categoria(),
    search: Optional[str] = _busqueda(),
    part_id: Optional[int] = Query(None, ge=1, description="Solo las ventas de este repuesto."),
    hoy: date = Depends(fecha_de_hoy),
    db: Session = Depends(get_db),
):
    # Unidades y facturación de cada mes (HU 5.4), y la proyección del mes
    # que viene para el mismo conjunto de repuestos (HU 5.5). La proyección
    # siempre mira 12 meses, aunque se muestren menos.
    por_mes = _meses_con_ventas(
        db,
        hoy,
        max(months, analitica.MESES_PROYECCION),
        category=category,
        search=search,
        part_id=part_id,
    )
    return {"months": por_mes[-months:], "projection": _proyeccion(por_mes, hoy)}


@router.get("/demand-forecast", response_model=DemandForecastResponse)
def demand_forecast(
    limit: int = Query(20, ge=1, le=2000, description="Cantidad de repuestos a devolver."),
    category: Optional[str] = _categoria(),
    search: Optional[str] = _busqueda(),
    hoy: date = Depends(fecha_de_hoy),
    db: Session = Depends(get_db),
):
    # Demanda proyectada del mes que viene por repuesto, de mayor a menor.
    mes, filas = crud_analytics.proyecciones(db, hoy, category=category, search=search)
    filas.sort(key=lambda fila: (-fila.projected_units, fila.part.part_code, fila.part.id))
    return {
        "month": analitica.texto_mes(mes),
        "parts": [
            {
                "id": fila.part.id,
                "part_code": fila.part.part_code,
                "name": fila.part.name,
                "manufacturer": fila.part.manufacturer,
                "category": fila.part.category,
                "stock": fila.part.stock,
                "units_last_12_months": sum(fila.units_by_month),
                "projected_units": fila.projected_units,
            }
            for fila in filas[:limit]
        ],
    }


@router.get("/stockout-risk", response_model=StockoutRiskResponse)
def stockout_risk(
    at_risk_only: bool = Query(False, description="Solo los de riesgo alto o medio (las alertas de reposición)."),
    category: Optional[str] = _categoria(),
    search: Optional[str] = _busqueda(),
    hoy: date = Depends(fecha_de_hoy),
    db: Session = Depends(get_db),
):
    mes, filas = crud_analytics.proyecciones(db, hoy, category=category, search=search)
    if at_risk_only:
        filas = [fila for fila in filas if fila.risk != analitica.RIESGO_BAJO]

    # Del más urgente al menos urgente: primero por nivel. Dentro de cada
    # nivel, los que dejarían más unidades sin cubrir el mes que viene; si
    # no, un agotado que vende 0,3 por mes taparía a uno que vende 50 y le
    # quedan 6 días. Después, los que se agotan antes; sin demanda, al final.
    filas.sort(
        key=lambda fila: (
            analitica.ORDEN_RIESGO[fila.risk],
            -max(fila.projected_units - fila.part.stock, 0),
            fila.coverage_days is None,
            fila.coverage_days or 0,
            fila.part.part_code,
            fila.part.id,
        )
    )
    return {
        "month": analitica.texto_mes(mes),
        "thresholds": {
            "high_below": analitica.DIAS_RIESGO_ALTO,
            "medium_up_to": analitica.DIAS_RIESGO_MEDIO,
        },
        "parts": [
            {
                "id": fila.part.id,
                "part_code": fila.part.part_code,
                "name": fila.part.name,
                "manufacturer": fila.part.manufacturer,
                "category": fila.part.category,
                "stock": fila.part.stock,
                "projected_units": fila.projected_units,
                "daily_demand": fila.daily_demand,
                "coverage_days": fila.coverage_days,
                "risk": fila.risk,
            }
            for fila in filas
        ],
    }


@router.get("/parts/{part_id}", response_model=PartAnalyticsOut)
def part_detail(
    part_id: int,
    hoy: date = Depends(fecha_de_hoy),
    db: Session = Depends(get_db),
):
    # Todo lo del dashboard sobre un repuesto (HU 5.8): stock, ventas de los
    # últimos 12 meses, proyección y riesgo.
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repuesto no encontrado.")

    mes, (fila,) = crud_analytics.proyecciones(db, hoy, part_id=part_id)
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
        "months": _meses_con_ventas(db, hoy, analitica.MESES_PROYECCION, part_id=part_id),
        "projection": {"month": analitica.texto_mes(mes), "units": fila.projected_units},
        "daily_demand": fila.daily_demand,
        "coverage_days": fila.coverage_days,
        "risk": fila.risk,
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
