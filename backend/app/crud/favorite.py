from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.compatibility import Compatibility
from app.models.favorite import Favorite
from app.models.part import Part


def list_favorite_parts(db: Session, client_id: int) -> list[Part]:
    query = (
        select(Part)
        .join(Favorite, Favorite.part_id == Part.id)
        .where(Favorite.client_id == client_id)
        .options(selectinload(Part.compatibilities).selectinload(Compatibility.car_model))
        .order_by(Favorite.favorite_id)
    )
    return list(db.scalars(query).all())


def get_favorite(db: Session, client_id: int, part_id: int) -> Favorite | None:
    query = select(Favorite).where(Favorite.client_id == client_id, Favorite.part_id == part_id)
    return db.scalars(query).first()


def add_favorite(db: Session, client_id: int, part_id: int) -> None:
    if get_favorite(db, client_id, part_id) is not None:
        return

    db.add(Favorite(client_id=client_id, part_id=part_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def remove_favorite(db: Session, client_id: int, part_id: int) -> None:
    favorite = get_favorite(db, client_id, part_id)
    if favorite is None:
        return

    db.delete(favorite)
    db.commit()
