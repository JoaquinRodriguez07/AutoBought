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


def get_or_create_cart(db: Session, client_id: int) -> Cart:
    """Cada cliente tiene a lo sumo un carrito (PK = client_id). Si
    todavía no tiene fila en `cart`, se crea vacía acá.
    """
    cart = get_cart(db, client_id)
    if cart is not None:
        return cart

    cart = Cart(client_id=client_id)
    db.add(cart)
    db.commit()

    return get_cart(db, client_id)


def get_cart_item(db: Session, client_id: int, part_id: int) -> CartItem | None:
    query = select(CartItem).where(
        CartItem.cart_id == client_id, CartItem.part_id == part_id
    )
    return db.scalars(query).first()


def add_item(db: Session, client_id: int, part_id: int, amount: int) -> CartItem:
    """Agrega `part_id` al carrito. Si ya estaba, suma `amount` a lo
    que ya había en vez de reemplazarlo.
    """
    get_or_create_cart(db, client_id)

    item = get_cart_item(db, client_id, part_id)
    if item is None:
        item = CartItem(cart_id=client_id, part_id=part_id, amount=amount)
        db.add(item)
    else:
        item.amount += amount

    db.commit()
    db.refresh(item)
    return item


def set_item_amount(
    db: Session, client_id: int, part_id: int, amount: int
) -> CartItem | None:
    """Reemplaza (no suma) la cantidad de un item ya existente en el
    carrito. Devuelve None si el item no está en el carrito.
    """
    item = get_cart_item(db, client_id, part_id)
    if item is None:
        return None

    item.amount = amount
    db.commit()
    db.refresh(item)
    return item


def remove_item(db: Session, client_id: int, part_id: int) -> bool:
    item = get_cart_item(db, client_id, part_id)
    if item is None:
        return False

    db.delete(item)
    db.commit()
    return True


def clear_cart(db: Session, client_id: int) -> None:
    query = select(CartItem).where(CartItem.cart_id == client_id)
    for item in db.scalars(query).all():
        db.delete(item)
    db.commit()
