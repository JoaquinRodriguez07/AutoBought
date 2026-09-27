from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import part as crud_part
from app.schemas.part import CategoriesResponse, PartsResponse, build_part_out


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
        description="Alias de 'search'. Si se envían ambos, 'search' tiene prioridad.",
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
    termino_busqueda = search or q
    categoria_filtro = categoria or category

    parts = crud_part.list_parts(
        db,
        brand=brand,
        model=model,
        year=year,
        search=termino_busqueda,
        category=categoria_filtro,
    )

    return {
        "parts": [
            build_part_out(part)
            for part in parts
        ]
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