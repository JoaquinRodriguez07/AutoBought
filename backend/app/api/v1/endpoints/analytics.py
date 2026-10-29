from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_employee, get_db
from app.crud import part as crud_part
from app.schemas.analytics import (
    AnalyticsBestSellersResponse,
    SalesEvolutionResponse,
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
    db: Session = Depends(get_db),
):
    parts = crud_part.list_stock(db)
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
    db: Session = Depends(get_db),
):
    # A diferencia de la tienda, incluye los que hoy no tienen stock: un más
    # vendido agotado es justo lo que hay que reponer.
    rows = crud_part.list_best_sellers(db, limit=limit, days=days)
    return {
        "days": days,
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


@router.get("/sales-evolution", response_model=SalesEvolutionResponse)
def sales_evolution(
    months: int = Query(
        12,
        ge=1,
        le=36,
        description="Cantidad de meses a devolver, terminando en el mes actual.",
    ),
    category: Optional[str] = Query(
        None,
        description="Solo las ventas de esta categoría. Sin valor: toda la tienda.",
    ),
    db: Session = Depends(get_db),
):
    # Un nombre que no existe no es "una categoría sin ventas": casi seguro es
    # un error de tipeo, y devolver ceros lo taparía.
    if category is not None and not crud_part.category_exists(db, category):
        raise HTTPException(status_code=404, detail="La categoría no existe.")
    return {
        "months": months,
        "category": category,
        "points": crud_part.list_monthly_sales(db, months=months, category=category),
    }
