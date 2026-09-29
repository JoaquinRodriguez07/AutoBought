from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


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
        query = query.where(CarModel.brand == brand)

    if model:
        query = query.where(CarModel.model == model)

    if year:
        query = query.where(
            Compatibility.year_from <= year,
            Compatibility.year_to >= year,
        )

    term = (search or "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.where(
            or_(
                Part.name.ilike(pattern),
                Part.part_code.ilike(pattern),
            )
        )

    categoria_term = (category or "").strip()
    if categoria_term:
        query = query.where(
            func.lower(Part.category) == categoria_term.lower()
        )

    return list(db.scalars(query).unique().all())


def list_categories(db: Session) -> list[tuple[str, int]]:
    query = (
        select(Part.category, func.count(Part.id))
        .group_by(Part.category)
        .order_by(Part.category)
    )
    return [(category, count) for category, count in db.execute(query).all()]

