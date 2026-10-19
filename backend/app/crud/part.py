from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.part import Part
from app.models.compatibility import Compatibility
from app.models.car_model import CarModel


def get_part(db: Session, part_id: int) -> Part | None:
    return db.get(Part, part_id)


def list_parts(
    db: Session,
    brand: str | None = None,
    model: str | None = None,
    year: int | None = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
) -> list[Part]:
    query = (
        select(Part)
        .join(Compatibility)
        .join(CarModel)
        .options(
            selectinload(Part.compatibilities).selectinload(
                Compatibility.car_model
            )
        )
        .distinct()
        .order_by(Part.id)
    )

    if brand:
        brand_term = brand.strip()
        query = query.where(func.lower(CarModel.brand) == brand_term.lower())

    if model:
        model_term = model.strip()
        query = query.where(func.lower(CarModel.model) == model_term.lower())

    if year:
        query = query.where(
            Compatibility.year_from <= year,
            Compatibility.year_to >= year,
        )

    # Búsqueda parcial, insensible a mayúsculas/minúsculas, por nombre o código.
    # Permite encontrar un repuesto sin ingresar el código completo
    # (ej: "BP12" encuentra "BP1234").
    term = (search or "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.where(
            or_(
                Part.name.ilike(pattern),
                Part.part_code.ilike(pattern),
            )
        )

    # Filtro exacto (insensible a mayúsculas/minúsculas) por categoría.
    # A diferencia de la búsqueda por nombre/código, no admite coincidencias
    # parciales porque la categoría es un valor discreto (ej: "frenos").
    categoria_term = (category or "").strip()
    if categoria_term:
        query = query.where(func.lower(Part.category) == categoria_term.lower())

    return list(db.scalars(query).unique().all())


def list_categories(db: Session) -> list[tuple[str, int]]:
    # Cantidad real de repuestos por categoría, agrupando por el valor tal
    # cual está guardado en la columna (case-sensitive), a diferencia de
    # list_parts que filtra sin distinguir mayúsculas/minúsculas. Si
    # coexistieran "Brakes" y "brakes", se mostrarían como categorías
    # separadas con conteos propios, pero filtrar por cualquiera de las dos
    # devolvería el mismo total combinado (conteo del sidebar ≠ resultados).
    # Ordenado alfabéticamente por nombre; las categorías sin repuestos no
    # aparecen (GROUP BY las excluye naturalmente).
    query = (
        select(Part.category, func.count(Part.id))
        .group_by(Part.category)
        .order_by(Part.category)
    )
    return [(category, count) for category, count in db.execute(query).all()]