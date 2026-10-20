from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.crud import text_search
from app.api.deps import get_db
from app.crud import part as crud_part
from app.schemas.part import (
    BestSellersResponse,
    CategoriesResponse,
    PartsResponse,
    build_part_out,
)


router = APIRouter(prefix="/parts", tags=["parts"])


@router.get("", response_model=PartsResponse)
def list_parts(
    brand: str | None = Query(default=None),
    model: str | None = Query(default=None),
    year: int | None = Query(default=None),
    search: Optional[str] = Query(
        None,
        min_length=1,
        description=(
            "Texto para buscar repuestos por nombre o código de forma parcial "
            "(no distingue mayúsculas/minúsculas). No es necesario ingresar "
            "el código completo."
        ),
    ),
    q: Optional[str] = Query(
        None,
        min_length=1,
        max_length=100,
        description=(
            "Búsqueda en lenguaje natural (ej: 'pastillas de freno onix 2020'). "
            "Detecta pieza, marca, modelo y año y los devuelve en 'entities'. "
            "Si se envía 'search', 'search' tiene prioridad."
        ),
    ),
    categoria: Optional[str] = Query(
        None,
        min_length=1,
        description=(
            "Categoría exacta por la cual filtrar repuestos (no distingue "
            "mayúsculas/minúsculas)."
        ),
    ),
    category: Optional[str] = Query(
        None,
        min_length=1,
        description="Alias de 'categoria'. Si se envían ambos, 'categoria' tiene prioridad.",
    ),
    db: Session = Depends(get_db),
):
    categoria_filtro = categoria or category
    entities = None

    if q and not search:
        entities, parts = text_search.search_parts(
            db,
            q,
            brand=brand,
            model=model,
            year=year,
            category=categoria_filtro,
        )
    else:
        parts = crud_part.list_parts(
            db,
            brand=brand,
            model=model,
            year=year,
            search=search,
            category=categoria_filtro,
        )

    return {
        "parts": [build_part_out(part) for part in parts],
        "entities": entities,
    }

# Nota: esta ruta debe declararse antes de cualquier futura ruta "/{id}" en
# este router, de lo contrario FastAPI intentaría interpretar "categories"
# como un identificador.
@router.get("/categories", response_model=CategoriesResponse)
def list_categories(db: Session = Depends(get_db)):
    categorias = crud_part.list_categories(db)
    return {
        "categories": [
            {"name": name, "count": count} for name, count in categorias
        ]
    }


# Igual que "/categories", debe declararse antes de cualquier ruta "/{id}".
@router.get("/best-sellers", response_model=BestSellersResponse)
def list_best_sellers(
    limit: int = Query(4, ge=1, le=20, description="Cantidad de repuestos a devolver."),
    days: Optional[int] = Query(
        None,
        ge=1,
        le=3650,
        description="Contar solo las ventas de los últimos N días. Sin valor: todas.",
    ),
    in_stock: bool = Query(
        False,
        description="Si es true, saltea los repuestos que hoy no tienen stock.",
    ),
    db: Session = Depends(get_db),
):
    best_sellers = crud_part.list_best_sellers(
        db, limit=limit, days=days, in_stock=in_stock
    )
    return {
        "parts": [
            {**build_part_out(part).model_dump(), "units_sold": units_sold}
            for part, units_sold in best_sellers
        ]
    }
