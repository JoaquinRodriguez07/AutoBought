"""Mails de pedidos, avisos y recordatorios.

Cada función arma un tipo de mail y decide a quién mandarlo. Las acciones
que todavía no existen (el vendedor cambia el estado o el precio, el
cliente cancela, se repone stock) solo tienen que llamar a la función que
corresponde: los mails ya quedan resueltos acá.

Las funciones que se llaman desde un endpoint reciben `background_tasks`
para mandar después de responder; sin él, mandan en el momento (las
tareas diarias, los tests).
"""

import calendar
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import BackgroundTasks
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import FRONTEND_URL
from app.core.email import send_mail, schedule_mail
from app.core.security import UNSUBSCRIBE_PURPOSE, create_purpose_token
from app.crud.payment import is_paid_order
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment
from app.models.stock_alert import StockAlert

# El enlace de baja no vence: tiene que seguir sirviendo en un mail viejo.
UNSUBSCRIBE_LINK_MINUTES = 10 * 365 * 24 * 60

ABANDONED_CART_HOURS = 24

# Cada cuántos meses se suele cambiar cada repuesto, según cómo empieza su
# nombre en el catálogo. Lo que no está acá no genera recordatorio.
MAINTENANCE_MONTHS = {
    # Antes que "Aceite": el de caja dura mucho más que el de motor.
    "Aceite de caja": 48,
    "Aceite": 6,
    "Líquido de frenos": 24,
    "Filtro": 6,
    "Bujía": 12,
    "Escobilla": 12,
    "Pastillas": 12,
    "Discos": 24,
    "Refrigerante": 24,
    "Batería": 36,
}

# Solo se recuerda si el plazo se cumplió hace poco. Si no, la primera vez
# que corren las tareas mandaría un recordatorio por cada compra vieja.
MAINTENANCE_WINDOW_DAYS = 7

_ESTADOS = {
    OrderStatus.PACKING: ("se está preparando", "Lo estamos empaquetando. Te avisamos cuando salga para tu dirección."),
    OrderStatus.SHIPPED: ("fue enviado", "Ya está en camino a tu dirección."),
    OrderStatus.DELIVERED: ("fue entregado", "Esperamos que todo esté bien. ¡Gracias por comprar en AutoBought!"),
}


def format_price(pesos: int) -> str:
    return "$ " + f"{pesos:,}".replace(",", ".")


def unsubscribe_link(client: Client) -> str:
    token = create_purpose_token(str(client.user_id), UNSUBSCRIBE_PURPOSE, UNSUBSCRIBE_LINK_MINUTES)
    return f"{FRONTEND_URL}/baja-mails?token={token}"


def _part_link(part: Part) -> str:
    # Cuando exista el detalle con URL propia (HU 1.16), apuntar ahí.
    return f"{FRONTEND_URL}/catalogo?q={quote(part.name)}"


def _schedule(background_tasks: BackgroundTasks | None, *args, **kwargs) -> None:
    schedule_mail(background_tasks, *args, **kwargs)


def _como_utc(when: datetime) -> datetime:
    # SQLite devuelve las fechas sin zona; Postgres, con zona.
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _add_months(when: datetime, periods: int) -> datetime:
    total = when.month - 1 + periods
    anio, period = when.year + total // 12, total % 12 + 1
    # Del 31 de agosto a 6 meses es el 28 o 29 de febrero, no un error.
    day_number = min(when.day, calendar.monthrange(anio, period)[1])
    return when.replace(year=anio, month=period, day=day_number)


# =====================================================
# Pedidos
# =====================================================


def _order_data(order: Order) -> dict:
    items = [
        {
            "nombre": item.part.name,
            "cantidad": item.quantity,
            "subtotal": format_price(item.frozen_price * item.quantity),
        }
        for item in order.items
    ]
    address = f"{order.ship_street} {order.ship_number}"
    if order.ship_apartment:
        address += f", apto. {order.ship_apartment}"
    address += f", {order.ship_city}, {order.ship_department}"

    return {
        "nombre": order.client.name,
        "pedido": order.order_id,
        "items": items,
        "total": format_price(sum(item.frozen_price * item.quantity for item in order.items)),
        "direccion": address,
        "pago": order.payment_method_label,
        "enlace": f"{FRONTEND_URL}/historial",
    }


def notify_purchase(order: Order, background_tasks: BackgroundTasks | None = None) -> None:
    _schedule(
        background_tasks,
        order.client.email,
        f"Confirmamos tu pedido #{order.order_id}",
        "confirmacion_compra",
        _order_data(order),
    )


def notify_paid_without_stock(order: Order, background_tasks: BackgroundTasks | None = None) -> None:
    """El cliente pagó después de que el pedido venciera y ya no queda stock:
    el pedido sigue cancelado y se le devuelve el dinero en Mercado Pago
    (ver payments._notify_approved_payment)."""
    _schedule(
        background_tasks,
        order.client.email,
        f"No pudimos completar tu pedido #{order.order_id}",
        "pago_sin_stock",
        _order_data(order),
    )


def notify_status_change(order: Order, background_tasks: BackgroundTasks | None = None) -> None:
    """Llamar después de cambiar `order.status` (panel del vendedor o
    cancelación). Para «confirmado» no hay mail: ese es el de la compra."""
    data = _order_data(order)

    if order.status == OrderStatus.CANCELLED:
        _schedule(
            background_tasks,
            order.client.email,
            f"Cancelamos tu pedido #{order.order_id}",
            "cancelacion_pedido",
            {**data, "motivo": order.cancellation_reason},
        )
        return

    if order.status not in _ESTADOS:
        return

    state, detail = _ESTADOS[order.status]
    _schedule(
        background_tasks,
        order.client.email,
        f"Tu pedido #{order.order_id} {state}",
        "cambio_estado",
        {**data, "estado": state, "detalle_estado": detail},
    )


# =====================================================
# Stock y precios
# =====================================================


def notify_back_in_stock(
    db: Session, part: Part, previous_stock: int, background_tasks: BackgroundTasks | None = None
) -> int:
    """Llamar después de cambiar `part.stock` (reposición del vendedor o
    cancelación de un pedido). Si pasó de 0 a más, avisa a los suscritos
    y borra las suscripciones. Devuelve a cuántos avisó."""
    if previous_stock > 0 or part.stock <= 0:
        return 0

    alertas = db.scalars(
        select(StockAlert).where(StockAlert.part_id == part.id).options(selectinload(StockAlert.client))
    ).all()
    for alerta in alertas:
        _schedule(
            background_tasks,
            alerta.client.email,
            f"Volvió a haber stock de {part.name}",
            "vuelta_stock",
            {
                "nombre": alerta.client.name,
                "repuesto": part.name,
                "precio": format_price(part.price),
                "enlace": _part_link(part),
            },
        )
        db.delete(alerta)
    db.commit()
    return len(alertas)


def notify_price_drop(
    db: Session, part: Part, previous_price: int, background_tasks: BackgroundTasks | None = None
) -> int:
    """Llamar después de cambiar `part.price`. Si bajó, avisa a quienes lo
    tienen en favoritos y no se dieron de baja. Devuelve a cuántos avisó."""
    if part.price >= previous_price:
        return 0

    customers = db.scalars(
        select(Client)
        .join(Favorite, Favorite.client_id == Client.user_id)
        .where(Favorite.part_id == part.id, Client.marketing_emails.is_(True))
    ).all()
    for client in customers:
        _schedule(
            background_tasks,
            client.email,
            f"Bajó el precio de {part.name}",
            "baja_precio",
            {
                "nombre": client.name,
                "repuesto": part.name,
                "precio_anterior": format_price(previous_price),
                "precio": format_price(part.price),
                "enlace": _part_link(part),
            },
            unsubscribe_link=unsubscribe_link(client),
        )
    return len(customers)


# =====================================================
# Tareas diarias (scripts/tareas_diarias.py)
# =====================================================


def remind_abandoned_carts(db: Session, current_time: datetime | None = None) -> int:
    """Un recordatorio por carrito con productos que no se tocó en 24 horas.
    Si el cliente lo vuelve a tocar y lo deja otra vez, recibe otro."""
    current_time = current_time or datetime.now(timezone.utc)
    limit_value = current_time - timedelta(hours=ABANDONED_CART_HOURS)

    carritos = db.scalars(
        select(Cart)
        .join(Client, Client.user_id == Cart.client_id)
        .where(Client.marketing_emails.is_(True), Cart.items.any())
        .options(selectinload(Cart.client), selectinload(Cart.items).selectinload(CartItem.part))
    ).all()

    sent = 0
    for cart in carritos:
        updated = _como_utc(cart.updated_at)
        already_notified = cart.reminder_sent_at is not None and _como_utc(cart.reminder_sent_at) >= updated
        if updated > limit_value or already_notified:
            continue

        if not send_mail(
            cart.client.email,
            "Te quedó algo en el carrito",
            "carrito_abandonado",
            {
                "nombre": cart.client.name,
                "items": [{"nombre": item.part.name, "cantidad": item.amount} for item in cart.items],
                "enlace": f"{FRONTEND_URL}/carrito",
            },
            unsubscribe_link=unsubscribe_link(cart.client),
        ):
            continue  # Sin marcar: se reintenta en la próxima corrida.
        cart.reminder_sent_at = current_time
        sent += 1

    db.commit()
    return sent


def _months_of(part: Part) -> int | None:
    return next(
        (periods for prefijo, periods in MAINTENANCE_MONTHS.items() if part.name.startswith(prefijo)),
        None,
    )


def _type_of(part: Part) -> str:
    """El repuesto sin el fabricante: "Bujía NGK 1.4 8V" y "Bujía Bosch 1.4 8V"
    son el mismo tipo de repuesto."""
    return part.name.replace(f" {part.manufacturer}", "", 1)


def remind_maintenance(db: Session, current_time: datetime | None = None) -> int:
    """Un recordatorio por repuesto comprado cuyo plazo de cambio se cumplió
    en los últimos 7 días. Pedidos cancelados o sin pagar no cuentan, y si el cliente
    volvió a comprar el mismo tipo de repuesto (aunque sea de otro
    fabricante), el recordatorio es el de la compra nueva."""
    current_time = current_time or datetime.now(timezone.utc)
    oldest = _add_months(current_time, -max(MAINTENANCE_MONTHS.values())) - timedelta(days=MAINTENANCE_WINDOW_DAYS)

    items = db.scalars(
        select(OrderItem)
        .join(Order, Order.order_id == OrderItem.order_id)
        .join(Client, Client.user_id == Order.client_id)
        .outerjoin(Payment, Payment.order_id == Order.order_id)
        .where(
            OrderItem.reminder_sent_at.is_(None),
            Order.status != OrderStatus.CANCELLED,
            is_paid_order(),
            Order.created_at >= oldest,
            Client.marketing_emails.is_(True),
        )
        .options(selectinload(OrderItem.part), selectinload(OrderItem.order).selectinload(Order.client))
    ).all()

    last_purchase: dict[tuple[int, str], datetime] = {}
    for client_id, part, when in db.execute(
        select(Order.client_id, Part, func.max(Order.created_at))
        .join(OrderItem, OrderItem.order_id == Order.order_id)
        .join(Part, Part.id == OrderItem.part_id)
        .outerjoin(Payment, Payment.order_id == Order.order_id)
        .where(Order.status != OrderStatus.CANCELLED, is_paid_order())
        .group_by(Order.client_id, Part.id)
    ):
        key = (client_id, _type_of(part))
        last_purchase[key] = max(last_purchase.get(key, _como_utc(when)), _como_utc(when))

    sent = 0
    for item in items:
        periods = _months_of(item.part)
        if periods is None:
            continue
        bought = _como_utc(item.order.created_at)
        if last_purchase[(item.order.client_id, _type_of(item.part))] > bought:
            continue
        vence = _add_months(bought, periods)
        if not current_time - timedelta(days=MAINTENANCE_WINDOW_DAYS) <= vence <= current_time:
            continue

        client = item.order.client
        if not send_mail(
            client.email,
            f"¿Toca cambiar {item.part.name}?",
            "recordatorio_mantenimiento",
            {
                "nombre": client.name,
                "repuesto": item.part.name,
                "meses": periods,
                "enlace": _part_link(item.part),
            },
            unsubscribe_link=unsubscribe_link(client),
        ):
            continue  # Sin marcar: se reintenta en la próxima corrida.
        item.reminder_sent_at = current_time
        sent += 1

    db.commit()
    return sent


DAILY_TASKS: dict[str, Callable[[Session, datetime | None], int]] = {
    "Carritos abandonados": remind_abandoned_carts,
    "Recordatorios de mantenimiento": remind_maintenance,
}
