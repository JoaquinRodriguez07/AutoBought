"""Consultas y cambios de los resúmenes del dashboard hechos con IA."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.dashboard_summary import DashboardSummary


def _cutoff(days: int, now: datetime | None) -> datetime:
    # "Los últimos N días" son las últimas N × 24 horas desde ahora.
    return (now or datetime.now(timezone.utc)) - timedelta(days=days)


def latest(db: Session) -> DashboardSummary | None:
    """El último resumen generado, o None si todavía no hay ninguno."""
    query = select(DashboardSummary).order_by(DashboardSummary.generated_at.desc(), DashboardSummary.id.desc())
    return db.scalars(query.limit(1)).first()


def recent(db: Session, days: int, now: datetime | None = None) -> list[DashboardSummary]:
    """Los resúmenes de los últimos `days` días, del más nuevo al más viejo.

    Args:
        db: la sesión de la base.
        days: cuántos días hacia atrás (IA_RESUMEN_DIAS_HISTORIAL).
        now: el momento actual; solo los tests lo pasan.

    Returns:
        Los resúmenes, también los de hoy. Lista vacía si no hay.
    """
    query = (
        select(DashboardSummary)
        .where(DashboardSummary.generated_at >= _cutoff(days, now))
        .order_by(DashboardSummary.generated_at.desc(), DashboardSummary.id.desc())
    )
    return list(db.scalars(query).all())


def save(db: Session, points: list[str], tokens: int, employee_id: int) -> DashboardSummary:
    """Guarda un resumen nuevo. Nunca pisa los anteriores: son el historial."""
    summary = DashboardSummary(points=points, tokens=tokens, generated_by=employee_id)
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


def delete_older_than(db: Session, days: int, now: datetime | None = None) -> int:
    """Borra los resúmenes de hace más de `days` días (lo llama la tarea
    diaria). Devuelve cuántos borró."""
    result = db.execute(delete(DashboardSummary).where(DashboardSummary.generated_at < _cutoff(days, now)))
    db.commit()
    return result.rowcount
