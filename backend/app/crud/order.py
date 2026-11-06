import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select, update
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
        payment.order.status = OrderStatus.CANCELLED
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
    order.status = OrderStatus.CONFIRMED
    return True


# =====================================================
# Estado del pedido (portal del vendedor)
# =====================================================

# Lo que puede hacer el vendedor: avanzar de a un paso...
NEXT_STATUS = {
    OrderStatus.CONFIRMED: OrderStatus.PACKING,
    OrderStatus.PACKING: OrderStatus.SHIPPED,
    OrderStatus.SHIPPED: OrderStatus.DELIVERED,
}
# ...o cancelar, si todavía no se entregó. Es algo excepcional: pide motivo
# y devuelve el pago (ver el endpoint).
CANCELLABLE = set(NEXT_STATUS)

_NOMBRES = {
    OrderStatus.CONFIRMED: "confirmado",
    OrderStatus.PACKING: "empaquetando",
    OrderStatus.SHIPPED: "enviado",
    OrderStatus.DELIVERED: "entregado",
    OrderStatus.CANCELLED: "cancelado",
}


class InvalidStatusChange(ValueError):
    """El cambio de estado no se puede hacer; el mensaje es para el vendedor."""


def next_status(order: Order) -> OrderStatus | None:
    """A qué estado lo puede pasar el vendedor ahora; None si no hay (no se
    pagó, ya se entregó o se canceló)."""
    return NEXT_STATUS.get(order.status) if order.is_paid else None


def can_cancel(order: Order) -> bool:
    return order.is_paid and order.status in CANCELLABLE


def check_status_change(order: Order, new_status: OrderStatus) -> None:
    """InvalidStatusChange si el vendedor no puede pasar el pedido a `new_status`."""
    actual = _NOMBRES[order.status]
    if order.status == new_status:
        raise InvalidStatusChange(f"El pedido ya está {actual}.")
    if order.status not in CANCELLABLE:
        raise InvalidStatusChange(f"El pedido ya está {actual}: no se puede cambiar.")
    if not order.is_paid:
        # Sin pagar no se prepara ni se cancela a mano: si no se paga a
        # tiempo se cancela solo (cancel_expired_orders) y el stock vuelve.
        # Cancelarlo antes dejaría vivo el link de pago, y pagarlo lo reactivaría.
        raise InvalidStatusChange(
            "El pedido todavía no está pagado. Si no se paga en "
            f"{MINUTOS_PARA_PAGAR} minutos desde la compra, se cancela solo y el stock vuelve."
        )
    if new_status == OrderStatus.CANCELLED:
        return
    siguiente = NEXT_STATUS[order.status]
    if new_status != siguiente:
        raise InvalidStatusChange(
            f"Un pedido {actual} solo puede pasar a {_NOMBRES[siguiente]} (o cancelarse)."
        )


def get_order_for_update(db: Session, order_id: int) -> Order | None:
    """El pedido, bloqueado hasta el commit: dos vendedores (o dos clics) no
    lo cambian a la vez, y el stock de una cancelación vuelve una sola vez."""
    query = (
        select(Order)
        .where(Order.order_id == order_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.part),
            selectinload(Order.payment),
            selectinload(Order.client),
        )
        .with_for_update(of=Order)
    )
    return db.scalar(query)


def apply_status_change(
    db: Session, order: Order, new_status: OrderStatus, reason: str | None = None
) -> None:
    """Cambia el estado (ya validado con check_status_change). Al cancelar,
    guarda el motivo y devuelve el stock. No hace commit: lo hace quien llama,
    después de devolver el pago."""
    order.status = new_status
    if new_status == OrderStatus.CANCELLED:
        order.cancellation_reason = reason
        _cambiar_stock(db, order, +1)


def _pagado():
    # = crud.payment.is_paid_order(), que no se importa porque crud.payment
    # importa este módulo. Pide un outer join con Payment.
    return or_(Payment.payment_id.is_(None), Payment.status == PaymentStatus.APPROVED)


def list_orders_for_seller(
    db: Session,
    status: OrderStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    paid_only: bool = False,
) -> tuple[list[Order], int]:
    """Los pedidos de todos los clientes, para el portal del vendedor, y
    cuántos hay con ese filtro. Los que están en curso, del más viejo al
    más nuevo (el que lleva más esperando, primero); los cerrados, al revés.
    Con `paid_only`, solo los pagados (los que se pueden preparar)."""
    query = select(Order)
    if status is not None:
        query = query.where(Order.status == status)
    if paid_only:
        query = query.outerjoin(Payment, Payment.order_id == Order.order_id).where(_pagado())
    total = db.scalar(select(func.count()).select_from(query.subquery()))

    en_curso = status in NEXT_STATUS
    orden = Order.created_at.asc() if en_curso else Order.created_at.desc()
    orders = db.scalars(
        query.options(
            selectinload(Order.items).selectinload(OrderItem.part),
            selectinload(Order.payment),
            selectinload(Order.client),
        )
        .order_by(orden, Order.order_id)
        .limit(limit)
        .offset(offset)
    ).all()
    return list(orders), total


def get_order_for_seller(db: Session, order_id: int) -> Order | None:
    """Cualquier pedido, con lo que muestra su detalle en el portal."""
    query = (
        select(Order)
        .where(Order.order_id == order_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.part),
            selectinload(Order.payment),
            selectinload(Order.client),
        )
    )
    return db.scalar(query)


def count_orders_by_status(db: Session) -> dict[OrderStatus, int]:
    rows = db.execute(select(Order.status, func.count()).group_by(Order.status)).all()
    return {status: rows_count for status, rows_count in rows}


def count_orders_to_prepare(db: Session) -> int:
    """Pedidos pagados que todavía nadie empezó a preparar."""
    return db.scalar(
        select(func.count())
        .select_from(Order)
        .outerjoin(Payment, Payment.order_id == Order.order_id)
        .where(Order.status == OrderStatus.CONFIRMED, _pagado())
    )


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
