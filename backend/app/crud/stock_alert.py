from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.stock_alert import StockAlert


def list_part_ids(db: Session, client_id: int) -> list[int]:
    query = select(StockAlert.part_id).where(StockAlert.client_id == client_id).order_by(StockAlert.part_id)
    return list(db.scalars(query).all())


def add_alert(db: Session, client_id: int, part_id: int) -> None:
    """Idempotente: pedir el aviso dos veces deja una sola suscripción."""
    query = select(StockAlert).where(StockAlert.client_id == client_id, StockAlert.part_id == part_id)
    if db.scalars(query).first() is not None:
        return
    db.add(StockAlert(client_id=client_id, part_id=part_id))
    try:
        db.commit()
    except IntegrityError:
        # Dos pedidos simultáneos: la restricción UNIQUE deja uno solo.
        db.rollback()


def remove_alert(db: Session, client_id: int, part_id: int) -> None:
    query = select(StockAlert).where(StockAlert.client_id == client_id, StockAlert.part_id == part_id)
    alerta = db.scalars(query).first()
    if alerta is not None:
        db.delete(alerta)
        db.commit()
