from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.car_model import CarModel
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.employee import Employee
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress


def _get_owned_or_primary(db: Session, model, pk_column, client_id: int, chosen_id: int | None):
    """Devuelve la fila elegida si es del cliente; sin elección, la principal."""
    query = select(model).where(model.client_id == client_id)
    if chosen_id is None:
        query = query.where(model.is_primary.is_(True))
    else:
        query = query.where(pk_column == chosen_id)
    return db.scalar(query)


# Lo que muestra el historial como medio de pago de los pedidos nuevos.
PAYMENT_LABEL = "Mercado Pago"


def place_order(
    db: Session,
    client_id: int,
    shipping_address_id: int | None = None,
) -> Order:
    """Place an order from a client's cart in a single transaction.

    Without an explicit shipping address, the client's primary one is used;
    it must belong to the client. The order starts with a pending payment:
    the client pays it afterwards on Mercado Pago. The stock is taken now,
    so it stays reserved while the client pays (or retries a rejected payment).
    """
    with db.begin():
        cart = db.scalar(
            select(Cart)
            .where(Cart.client_id == client_id)
            .options(selectinload(Cart.items))
            .with_for_update()
        )
        if cart is None:
            raise ValueError("Client cart not found")
        if not cart.items:
            raise ValueError("Cannot place an order from an empty cart")

        address = _get_owned_or_primary(
            db, ShippingAddress, ShippingAddress.shipping_address_id,
            client_id, shipping_address_id,
        )
        if address is None:
            if shipping_address_id is None:
                raise ValueError("Client has no shipping address")
            raise ValueError("Shipping address not found")

        part_ids = [item.part_id for item in cart.items]
        parts = db.scalars(
            select(Part)
            .where(Part.id.in_(part_ids))
            .with_for_update()
        ).all()
        parts_by_id = {part.id: part for part in parts}

        missing_part_ids = [part_id for part_id in part_ids if part_id not in parts_by_id]
        if missing_part_ids:
            raise ValueError(f"Parts not found: {missing_part_ids}")

        for cart_item in cart.items:
            part = parts_by_id[cart_item.part_id]
            if part.stock < cart_item.amount:
                raise ValueError(
                    f"Not enough stock for part {part.id}: "
                    f"requested {cart_item.amount}, available {part.stock}"
                )

        order = Order(
            client_id=client_id,
            shipping_address_id=address.shipping_address_id,
            ship_personal_name=address.personal_name,
            ship_street=address.street,
            ship_number=address.number,
            ship_apartment=address.apartment,
            ship_city=address.city,
            ship_department=address.department,
            ship_postal_code=address.postal_code,
            payment_method_label=PAYMENT_LABEL,
            payment=Payment(status=PaymentStatus.PENDING),
        )
        db.add(order)
        db.flush()

        for cart_item in cart.items:
            part = parts_by_id[cart_item.part_id]
            order.items.append(
                OrderItem(
                    part_id=part.id,
                    quantity=cart_item.amount,
                    frozen_price=part.price,
                )
            )
            part.stock -= cart_item.amount

        cart.items.clear()
        return order


def list_order_by_client(db: Session, client_id: int) -> list[Order]:
    query = (
        select(Order)
        .where(Order.client_id == client_id)
        .options(selectinload(Order.items).selectinload(OrderItem.part), selectinload(Order.payment))
        .order_by(Order.created_at.desc())
    )
    return list(db.scalars(query).all())


def get_order_for_client(
    db: Session, order_id: int, client_id: int
) -> Order | None:
    query = (
        select(Order)
        .where(Order.order_id == order_id, Order.client_id == client_id)
        .options(selectinload(Order.items).selectinload(OrderItem.part), selectinload(Order.payment))
    )
    return db.scalar(query)
