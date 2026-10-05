from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.compatibility import Compatibility
from app.models.part import Part

MAX_RECOMMENDATIONS = 3

# Para cada categoría, las categorías que se suelen comprar junto con ella,
# en orden de prioridad. Los nombres son los de la columna Part.category
# (ver list_categories / scripts/generate_dataset.py).
COMPLEMENTARY_CATEGORIES = {
    "Filtros": ["Lubricantes", "Encendido"],
    "Lubricantes": ["Filtros"],
    "Encendido": ["Filtros"],
    "Motor": ["Refrigeración", "Lubricantes"],
    "Refrigeración": ["Motor"],
    "Frenos": ["Suspensión"],
    "Suspensión": ["Frenos"],
    "Carrocería": ["Accesorios"],
    "Accesorios": ["Carrocería"],
}


def find_missing_part_ids(db: Session, part_ids: list[int]) -> list[int]:
    """Devuelve los ids de `part_ids` que no existen en la base."""
    existing = set(db.scalars(select(Part.id).where(Part.id.in_(part_ids))))
    return [part_id for part_id in part_ids if part_id not in existing]


def _complementary_candidates(
    db: Session, part: Part, excluded_ids: list[int]
) -> list[Part]:
    """Repuestos de categorías complementarias a `part`, compatibles con
    alguno de sus vehículos (mismo modelo y años que se superponen) y con
    stock, ordenados por prioridad de categoría y luego por id."""
    categories = COMPLEMENTARY_CATEGORIES.get(part.category, [])
    if not categories or not part.compatibilities:
        return []

    same_vehicle = or_(
        *(
            and_(
                Compatibility.car_model_id == compatibility.car_model_id,
                Compatibility.year_from <= compatibility.year_to,
                Compatibility.year_to >= compatibility.year_from,
            )
            for compatibility in part.compatibilities
        )
    )
    query = (
        select(Part)
        .join(Compatibility)
        .where(
            Part.category.in_(categories),
            Part.stock > 0,
            Part.id.not_in(excluded_ids),
            same_vehicle,
        )
        .options(
            selectinload(Part.compatibilities).selectinload(
                Compatibility.car_model
            )
        )
        .distinct()
        .order_by(Part.id)
    )
    candidates = db.scalars(query).all()
    return sorted(candidates, key=lambda p: categories.index(p.category))


def get_recommendations(db: Session, part_ids: list[int]) -> list[Part]:
    """Repuestos complementarios para los repuestos del carrito (0 a 3).

    Primera versión basada en una regla simple (Sprint 3): para cada
    repuesto se sugieren repuestos de categorías complementarias,
    compatibles con alguno de sus vehículos y con stock, sin repetir los
    repuestos consultados. Las sugerencias se reparten por turnos entre los
    repuestos del carrito para que no las acapare el primero.
    """
    parts = db.scalars(
        select(Part)
        .where(Part.id.in_(part_ids))
        .options(selectinload(Part.compatibilities))
    ).all()
    parts_by_id = {part.id: part for part in parts}

    candidate_lists = [
        _complementary_candidates(db, parts_by_id[part_id], part_ids)
        for part_id in part_ids
        if part_id in parts_by_id
    ]

    recommendations: list[Part] = []
    seen: set[int] = set()
    for turn in range(max((len(c) for c in candidate_lists), default=0)):
        for candidates in candidate_lists:
            if turn >= len(candidates) or candidates[turn].id in seen:
                continue
            seen.add(candidates[turn].id)
            recommendations.append(candidates[turn])
            if len(recommendations) == MAX_RECOMMENDATIONS:
                return recommendations
    return recommendations
