from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.part import Part


def find_missing_part_ids(db: Session, part_ids: list[int]) -> list[int]:
    """Devuelve los ids de `part_ids` que no existen en la base."""
    existing = set(db.scalars(select(Part.id).where(Part.id.in_(part_ids))))
    return [part_id for part_id in part_ids if part_id not in existing]


def get_recommendations(db: Session, part_ids: list[int]) -> list[Part]:
    """Repuestos complementarios para los repuestos del carrito (0 a 3).

    Por ahora no sugiere nada: la regla de categorías complementarias se
    implementa en SCRUM-112. Devolver una lista vacía respeta el contrato
    (200 con {"parts": []}).
    """
    return []
