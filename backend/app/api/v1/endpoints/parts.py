from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import part as crud_part
from app.schemas.part import CategoriesResponse, PartsResponse, build_part_out


router = APIRouter(prefix="/parts", tags=["parts"])


@router.get("", response_model=PartsResponse)
def list_parts(
    brand: str | None = Query(
        default=None,
        description="Filtra por marca del vehículo compatible (ej: 'Ford').",
    ),
    model: str | None = Query(
        default=None,
        description="Filtra por modelo del vehículo compatible (ej: 'Fiesta').",
    ),
    year: int | None = Query(
        default=None,
        description=(
            "Filtra por año del vehículo (debe caer entre "
            "year_from y year_to de alguna compatibilidad)."
        ),
    ),
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
        description="Alias de 'search'. Si se envían ambos, 'search' tiene prioridad.",
    ),
    category: Optional[str] = Query(
        None,
        min_length=1,
        description="Alias de 'categoria'. Si se envían ambos, 'categoria' tiene prioridad.",
    ),
    categoria: Optional[str] = Query(
        None,
        min_length=1,
        description=(
            "Categoría exacta por la cual filtrar repuestos "
            "(no distingue mayúsculas/minúsculas)."
        ),
    ),
    marca: Optional[str] = Query(None, description="Alias de 'brand'."),
    modelo: Optional[str] = Query(None, description="Alias de 'model'."),
    anio: Optional[int] = Query(None, description="Alias de 'year'."),
    db: Session = Depends(get_db),
):
    termino_busqueda = search or q

    parts = crud_part.list_parts(
        db,
        search=termino_busqueda,
        category=categoria or category,
        brand=brand or marca,
        model=model or modelo,
        year=year or anio,
    )

    return {"parts": [build_part_out(part) for part in parts]}


@router.get("/categories", response_model=CategoriesResponse)
def list_categories(db: Session = Depends(get_db)):
    categorias = crud_part.list_categories(db)
    return {"categories": [{"name": name, "count": count} for name, count in categorias]}

