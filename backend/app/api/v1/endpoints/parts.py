"""Endpoints del catálogo de repuestos y del alta y edición de repuestos del vendedor."""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.crud import text_search
from app.api.deps import get_current_employee, get_db
from app.core.notifications import notify_price_drop, notify_back_in_stock
from app.crud import part as crud_part
from app.crud.order import cancel_expired_orders
from app.schemas.part import (
    BestSellersResponse,
    CategoriesResponse,
    ManufacturersResponse,
    PartCreate,
    PartOut,
    PartsResponse,
    PartUpdate,
    StockUpdate,
    build_part_out,
)


router = APIRouter(prefix="/parts", tags=["parts"])

# El catálogo completo tarda en armarse. Vercel guarda la respuesta 1 minuto
# y, pasado ese tiempo, sigue mostrando la guardada mientras pide una nueva.
# El stock puede verse con hasta un minuto de atraso; al pagar se valida el real.
CATALOG_CACHE = "public, s-maxage=60, stale-while-revalidate=300"


@router.get("", response_model=PartsResponse)
def list_parts(
    response: Response,
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
    response.headers["Cache-Control"] = CATALOG_CACHE
    # Antes de mostrar el stock, se libera el de los pedidos vencidos.
    cancel_expired_orders(db)
    category_filter = categoria or category
    entities = None

    if q and not search:
        entities, parts = text_search.search_parts(
            db,
            q,
            brand=brand,
            model=model,
            year=year,
            category=category_filter,
        )
    else:
        parts = crud_part.list_parts(
            db,
            brand=brand,
            model=model,
            year=year,
            search=search,
            category=category_filter,
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
    categories = crud_part.list_categories(db)
    return {
        "categories": [
            {"name": name, "count": count} for name, count in categories
        ]
    }


# Igual que "/categories", debe declararse antes de cualquier ruta "/{id}".
@router.get("/manufacturers", response_model=ManufacturersResponse)
def list_manufacturers(db: Session = Depends(get_db)):
    """Fabricantes con repuestos, del que más tiene al que menos."""
    return {
        "manufacturers": [
            {"name": name, "count": count} for name, count in crud_part.list_manufacturers(db)
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
    cancel_expired_orders(db)
    best_sellers = crud_part.list_best_sellers(
        db, limit=limit, days=days, in_stock=in_stock
    )
    return {
        "parts": [
            {**build_part_out(part).model_dump(), "units_sold": units_sold}
            for part, units_sold in best_sellers
        ]
    }


@router.get("/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    cancel_expired_orders(db)
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repuesto no encontrado.",
        )
    return build_part_out(part)


# --- Alta y edición de repuestos desde el dashboard (HU 5.10) ---
# Solo vendedores: un cliente recibe 403 y sin sesión, 401.


def _validate(db: Session, data, exclude_id: int | None = None) -> None:
    if crud_part.part_code_in_use(db, data.part_code, exclude_id=exclude_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un repuesto con ese código.",
        )
    if crud_part.missing_car_models(db, [c.car_model_id for c in data.compatibilities]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Alguno de los vehículos compatibles no existe.",
        )


def _part_or_404(db: Session, part_id: int):
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repuesto no encontrado.",
        )
    return part


@router.post(
    "",
    response_model=PartOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_employee)],
)
def create_part(data: PartCreate, db: Session = Depends(get_db)):
    _validate(db, data)
    return build_part_out(crud_part.create_part(db, data))


@router.put("/{part_id}", response_model=PartOut, dependencies=[Depends(get_current_employee)])
def update_part(
    part_id: int,
    data: PartUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    part = _part_or_404(db, part_id)
    _validate(db, data, exclude_id=part_id)
    previous_price = part.price
    part = crud_part.update_part(db, part, data)
    notify_price_drop(db, part, previous_price, background_tasks)
    return build_part_out(part)


@router.patch("/{part_id}/stock", response_model=PartOut, dependencies=[Depends(get_current_employee)])
def update_stock(
    part_id: int,
    data: StockUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    part = _part_or_404(db, part_id)
    previous_stock = part.stock
    part = crud_part.set_stock(db, part, data.stock)
    # Si volvió a haber stock, avisa a quienes lo pidieron (BotonAvisoStock).
    notify_back_in_stock(db, part, previous_stock, background_tasks)
    return build_part_out(part)
