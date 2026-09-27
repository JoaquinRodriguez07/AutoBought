from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.cart import Cart
from app.models.cart_item import CartItem

def get_cart(db: Session, client_id: int) -> Cart | None:
    query = (
        select(Cart)
        .where(Cart.client_id == client_id)
        .options(selectinload(Cart.items).selectinload(CartItem.part))
    )
    return db.scalars(query).first()