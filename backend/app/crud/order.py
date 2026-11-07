import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

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
from app.models.order_status_history import CancelReason, OrderStatusHistory
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress

logger = logging.getLogger(__name__)


# Por qué no se pudo hacer el pedido. Siguen siendo ValueError (con el mismo
# mensaje de siempre), pero el endpoint los distingue por la clase.
class CarritoVacio(ValueError):
    pass


class SinDireccion(ValueError):
    pass


class DireccionNoEncontrada(ValueError):
    pass


class RepuestosNoEncontrados(ValueError):
    pass


class SinStock(ValueError):
    def __init__(self, part_id: int, pedido: int, disponible: int):
        super().__init__(
            f"Not enough stock for part {part_id}: requested {pedido}, available {disponible}"
        )
        self.part_id = part_id
        self.pedido = pedido
        self.disponible = disponible


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
            raise CarritoVacio("Client cart not found")
        if not cart.items:
            raise CarritoVacio("Cannot place an order from an empty cart")

        address = _get_owned_or_primary(
            db, ShippingAddress, ShippingAddress.shipping_address_id,
            client_id, shipping_address_id,
        )
        if address is None:
            if shipping_address_id is None:
                raise SinDireccion("Client has no shipping address")
            raise DireccionNoEncontrada("Shipping address not found")

        part_ids = [item.part_id for item in cart.items]
        parts = db.scalars(
            select(Part)
            .where(Part.id.in_(part_ids))
            .with_for_update()
        ).all()
        parts_by_id = {part.id: part for part in parts}

        missing_part_ids = [part_id for part_id in part_ids if part_id not in parts_by_id]
        if missing_part_ids:
            raise RepuestosNoEncontrados(f"Parts not found: {missing_part_ids}")

        for cart_item in cart.items:
            part = parts_by_id[cart_item.part_id]
            if part.stock < cart_item.amount:
                raise SinStock(part.id, cart_item.amount, part.stock)

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
    vencidos = (
        Payment.status != PaymentStatus.APPROVED,
        Order.status == OrderStatus.CONFIRMED,
        Payment.created_at <= limite,
    )
    # Se llama en cada vista del catálogo: primero se pregunta sin bloquear
    # nada. Casi siempre no hay vencidos y no se bloquea ni se guarda nada.
    if db.scalar(select(Payment.payment_id).join(Order).where(*vencidos).limit(1)) is None:
        return 0

    pagos = db.scalars(
        select(Payment)
        .join(Order)
        .where(*vencidos)
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
            "Pedido %s pagado después de vencer y sin stock: se devuelve el pago.", order.order_id
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


# =====================================================
# Estado del pedido (portal del vendedor)
# =====================================================

# Lo que puede hacer el vendedor: avanzar de a un paso...
NEXT_STATUS = {
    OrderStatus.CONFIRMED: OrderStatus.PACKING,
    OrderStatus.PACKING: OrderStatus.SHIPPED,
    OrderStatus.SHIPPED: OrderStatus.DELIVERED,
}
# ...volver un paso atrás, para corregir un error (sin mail al cliente)...
PREVIOUS_STATUS = {siguiente: actual for actual, siguiente in NEXT_STATUS.items()}
# ...o cancelar, si todavía no se entregó. Es algo excepcional: pide motivo
# y devuelve el pago (ver el endpoint).
CANCELLABLE = set(NEXT_STATUS)
# La dirección de envío se puede corregir mientras el pedido no salió.
SHIPPING_EDITABLE = {OrderStatus.CONFIRMED, OrderStatus.PACKING}

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


def previous_status(order: Order) -> OrderStatus | None:
    """A qué estado lo puede devolver el vendedor si se equivocó; None si no
    hay (no se pagó, está confirmado o se canceló)."""
    return PREVIOUS_STATUS.get(order.status) if order.is_paid else None


def is_step_back(order: Order, new_status: OrderStatus) -> bool:
    return new_status == previous_status(order)


def can_cancel(order: Order) -> bool:
    return order.is_paid and order.status in CANCELLABLE


def can_edit_shipping(order: Order) -> bool:
    return order.status in SHIPPING_EDITABLE


def check_status_change(order: Order, new_status: OrderStatus) -> None:
    """InvalidStatusChange si el vendedor no puede pasar el pedido a `new_status`."""
    actual = _NOMBRES[order.status]
    if order.status == new_status:
        raise InvalidStatusChange(f"El pedido ya está {actual}.")
    if is_step_back(order, new_status):
        return
    if order.status not in CANCELLABLE:
        anterior = previous_status(order)
        if anterior is not None:
            raise InvalidStatusChange(f"El pedido ya está {actual}: solo puede volver a {_NOMBRES[anterior]}.")
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
        anterior = previous_status(order)
        volver = f", volver a {_NOMBRES[anterior]}" if anterior else ""
        raise InvalidStatusChange(
            f"Un pedido {actual} solo puede pasar a {_NOMBRES[siguiente]}{volver} (o cancelarse)."
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


def update_shipping_address(order: Order, address) -> None:
    """Corrige la copia de la dirección guardada en el pedido (ya validada:
    las mismas reglas que una dirección del perfil). No toca la del perfil
    del cliente ni hace commit."""
    order.ship_personal_name = address.personal_name
    order.ship_street = address.street
    order.ship_number = address.number
    order.ship_apartment = address.apartment
    order.ship_city = address.city
    order.ship_department = address.department.value
    order.ship_postal_code = address.postal_code


def apply_status_change(
    db: Session, order: Order, new_status: OrderStatus, reason: str | None = None
) -> None:
    """Cambia el estado (ya validado con check_status_change). Al cancelar,
    guarda el motivo y devuelve el stock. No hace commit: lo hace quien llama,
    después de devolver el pago. Pasa por `cambiar_estado`, así el cambio
    queda en el historial y el cliente lo ve en su línea de tiempo."""
    if new_status == OrderStatus.CANCELLED:
        cambiar_estado(order, new_status, CancelReason.STORE)
        order.cancellation_reason = reason
        _cambiar_stock(db, order, +1)
    else:
        cambiar_estado(order, new_status)


def _pagado():
    # = crud.payment.is_paid_order(), que no se importa porque crud.payment
    # importa este módulo. Pide un outer join con Payment.
    return or_(Payment.payment_id.is_(None), Payment.status == PaymentStatus.APPROVED)


SellerOrderSort = Literal["priority", "newest", "oldest", "client_asc", "client_desc", "total_desc", "total_asc"]


def _total_del_pedido():
    # El total no se guarda: es la suma de los productos al precio de la compra.
    return (
        select(func.coalesce(func.sum(OrderItem.frozen_price * OrderItem.quantity), 0))
        .where(OrderItem.order_id == Order.order_id)
        .correlate(Order)
        .scalar_subquery()
    )


def list_orders_for_seller(
    db: Session,
    status: OrderStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    paid_only: bool = False,
    sort: SellerOrderSort = "priority",
) -> tuple[list[Order], int]:
    """Los pedidos de todos los clientes, para el portal del vendedor, y
    cuántos hay con ese filtro. Con `paid_only`, solo los pagados (los que
    se pueden preparar). `sort="priority"`: los que están en curso, del más
    viejo al más nuevo (el que lleva más esperando, primero); los cerrados,
    al revés. Si no, por fecha, por nombre del cliente o por total."""
    query = select(Order)
    if status is not None:
        query = query.where(Order.status == status)
    if paid_only:
        query = query.outerjoin(Payment, Payment.order_id == Order.order_id).where(_pagado())
    total = db.scalar(select(func.count()).select_from(query.subquery()))

    if sort == "priority":
        orden = Order.created_at.asc() if status in NEXT_STATUS else Order.created_at.desc()
    elif sort in ("newest", "oldest"):
        orden = Order.created_at.desc() if sort == "newest" else Order.created_at.asc()
    elif sort in ("client_asc", "client_desc"):
        query = query.join(Client, Client.user_id == Order.client_id)
        nombre = func.lower(Client.name)
        orden = nombre.asc() if sort == "client_asc" else nombre.desc()
    else:
        orden = _total_del_pedido().desc() if sort == "total_desc" else _total_del_pedido().asc()

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
