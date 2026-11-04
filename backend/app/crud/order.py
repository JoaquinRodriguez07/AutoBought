import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import MINUTOS_PARA_PAGAR
from app.models.car_model import CarModel
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.employee import Employee
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.order_status_history import CancelReason, OrderStatusHistory
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress

logger = logging.getLogger(__name__)


def _get_owned_or_primary(db: Session, model, pk_column, client_id: int, chosen_id: int | None):
    """Devuelve la fila elegida si es del cliente; sin elección, la principal."""
    query = select(model).where(model.client_id == client_id)
    if chosen_id is None:
        query = query.where(model.is_primary.is_(True))
    else:
        query = query.where(pk_column == chosen_id)
    return db.scalar(query)


def cambiar_estado(order: Order, estado: OrderStatus, motivo: CancelReason | None = None) -> None:
    """Cambia el estado del pedido y lo deja en su historial, con la fecha:
    de ahí sale la línea de tiempo del cliente. Todo cambio de estado pasa
    por acá (también los del vendedor). No hace commit: lo hace quien llama."""
    order.status = estado
    order.status_history.append(
        OrderStatusHistory(status=estado, reason=motivo.value if motivo else None)
    )


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
    so it stays reserved while the client pays (or retries a rejected payment),
    until the deadline (see `cancel_expired_orders`).
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
        cambiar_estado(order, OrderStatus.CONFIRMED)
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


def _cambiar_stock(db: Session, order: Order, signo: int) -> None:
    # En SQL (stock = stock ± n) y no en Python: así no pisa una compra que
    # esté descontando el mismo repuesto al mismo tiempo.
    for item in order.items:
        db.execute(
            update(Part)
            .where(Part.id == item.part_id)
            .values(stock=Part.stock + signo * item.quantity)
        )


def cancel_expired_orders(db: Session, ahora: datetime | None = None) -> int:
    """Cancela los pedidos que no se pagaron a tiempo y devuelve su stock.

    No hay un proceso que corra cada minuto: se llama antes de comprar, al
    ver el historial o el catálogo, al pedir un link de pago, en el dashboard
    de stock del vendedor y en las tareas diarias. Devuelve cuántos canceló.
    """
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    # El mismo plazo que `Payment.due_at`, pero filtrado en la base: casi
    # siempre no hay ninguno vencido y no se trae nada.
    limite = ahora - timedelta(minutes=MINUTOS_PARA_PAGAR)
    pagos = db.scalars(
        select(Payment)
        .join(Order)
        .where(
            Payment.status != PaymentStatus.APPROVED,
            Order.status == OrderStatus.CONFIRMED,
            Payment.created_at <= limite,
        )
        .options(selectinload(Payment.order).selectinload(Order.items))
        .order_by(Payment.payment_id)
        # Solo se bloquean los pagos, siempre en el mismo orden. Si otra
        # llamada ya está cancelando alguno (o el webhook lo está aprobando),
        # se saltea en vez de esperarlo: el stock vuelve una sola vez.
        .with_for_update(skip_locked=True, of=Payment)
    ).all()

    for payment in pagos:
        cambiar_estado(payment.order, OrderStatus.CANCELLED, CancelReason.EXPIRED)
        _cambiar_stock(db, payment.order, +1)

    db.commit()
    return len(pagos)


def reactivate_paid_order(db: Session, order: Order) -> bool:
    """Un pago aprobado de un pedido que ya se había cancelado por vencido
    (el cliente pagó justo sobre el límite). Si todavía hay stock, el pedido
    vuelve a estar confirmado. Si no, queda cancelado y en el log, para
    devolver el dinero a mano (al cliente se le avisa por mail desde el
    endpoint). No hace commit: lo hace quien llama."""
    partes = {
        part.id: part
        for part in db.scalars(
            select(Part).where(Part.id.in_([item.part_id for item in order.items])).with_for_update()
        )
    }
    if any(partes[item.part_id].stock < item.quantity for item in order.items):
        logger.warning(
            "Pedido %s pagado después de vencer y sin stock: devolver el pago.", order.order_id
        )
        return False

    _cambiar_stock(db, order, -1)
    cambiar_estado(order, OrderStatus.CONFIRMED)
    return True


def confirm_received(db: Session, order: Order) -> bool:
    """El cliente avisa que le llegó el pedido: de «Enviado» pasa a
    «Entregado». Devuelve False (y no cambia nada) si no estaba enviado."""
    if order.status != OrderStatus.SHIPPED:
        return False
    cambiar_estado(order, OrderStatus.DELIVERED)
    db.commit()
    return True


def list_order_by_client(db: Session, client_id: int) -> list[Order]:
    query = (
        select(Order)
        .where(Order.client_id == client_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.part),
            selectinload(Order.payment),
            selectinload(Order.status_history),
        )
        .order_by(Order.created_at.desc())
    )
    return list(db.scalars(query).all())


def get_order_for_client(
    db: Session, order_id: int, client_id: int
) -> Order | None:
    query = (
        select(Order)
        .where(Order.order_id == order_id, Order.client_id == client_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.part),
            selectinload(Order.payment),
            selectinload(Order.status_history),
        )
    )
    return db.scalar(query)
