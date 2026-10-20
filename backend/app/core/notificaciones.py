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
from app.core.email import enviar_mail
from app.core.security import DARSE_DE_BAJA, create_purpose_token
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.stock_alert import StockAlert

# El enlace de baja no vence: tiene que seguir sirviendo en un mail viejo.
VIGENCIA_BAJA_MINUTOS = 10 * 365 * 24 * 60

HORAS_CARRITO_ABANDONADO = 24

# Cada cuántos meses se suele cambiar cada repuesto, según cómo empieza su
# nombre en el catálogo. Lo que no está acá no genera recordatorio.
MESES_MANTENIMIENTO = {
    "Aceite": 6,
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
DIAS_VENTANA_MANTENIMIENTO = 7

_ESTADOS = {
    OrderStatus.SHIPPED: ("fue enviado", "Ya está en camino a tu dirección."),
    OrderStatus.DELIVERED: ("fue entregado", "Esperamos que todo esté bien. ¡Gracias por comprar en AutoBought!"),
}


def precio(pesos: int) -> str:
    return "$ " + f"{pesos:,}".replace(",", ".")


def enlace_baja(client: Client) -> str:
    token = create_purpose_token(str(client.user_id), DARSE_DE_BAJA, VIGENCIA_BAJA_MINUTOS)
    return f"{FRONTEND_URL}/baja-mails?token={token}"


def _enlace_repuesto(part: Part) -> str:
    # Cuando exista el detalle con URL propia (HU 1.16), apuntar ahí.
    return f"{FRONTEND_URL}/catalogo?q={quote(part.name)}"


def _programar(background_tasks: BackgroundTasks | None, *args, **kwargs) -> None:
    if background_tasks is None:
        enviar_mail(*args, **kwargs)
    else:
        background_tasks.add_task(enviar_mail, *args, **kwargs)


def _como_utc(fecha: datetime) -> datetime:
    # SQLite devuelve las fechas sin zona; Postgres, con zona.
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


def _sumar_meses(fecha: datetime, meses: int) -> datetime:
    total = fecha.month - 1 + meses
    anio, mes = fecha.year + total // 12, total % 12 + 1
    # Del 31 de agosto a 6 meses es el 28 o 29 de febrero, no un error.
    dia = min(fecha.day, calendar.monthrange(anio, mes)[1])
    return fecha.replace(year=anio, month=mes, day=dia)


# =====================================================
# Pedidos
# =====================================================


def _datos_pedido(order: Order) -> dict:
    items = [
        {
            "nombre": item.part.name,
            "cantidad": item.quantity,
            "subtotal": precio(item.frozen_price * item.quantity),
        }
        for item in order.items
    ]
    direccion = f"{order.ship_street} {order.ship_number}"
    if order.ship_apartment:
        direccion += f", apto. {order.ship_apartment}"
    direccion += f", {order.ship_city}, {order.ship_department}"

    return {
        "nombre": order.client.name,
        "pedido": order.order_id,
        "items": items,
        "total": precio(sum(item.frozen_price * item.quantity for item in order.items)),
        "direccion": direccion,
        "pago": order.payment_method_label,
        "enlace": f"{FRONTEND_URL}/historial",
    }


def notificar_compra(order: Order, background_tasks: BackgroundTasks | None = None) -> None:
    _programar(
        background_tasks,
        order.client.email,
        f"Confirmamos tu pedido #{order.order_id}",
        "confirmacion_compra",
        _datos_pedido(order),
    )


def notificar_cambio_de_estado(order: Order, background_tasks: BackgroundTasks | None = None) -> None:
    """Llamar después de cambiar `order.status` (panel del vendedor o
    cancelación). Para «confirmado» no hay mail: ese es el de la compra."""
    datos = _datos_pedido(order)

    if order.status == OrderStatus.CANCELLED:
        _programar(
            background_tasks,
            order.client.email,
            f"Cancelamos tu pedido #{order.order_id}",
            "cancelacion_pedido",
            datos,
        )
        return

    if order.status not in _ESTADOS:
        return

    estado, detalle = _ESTADOS[order.status]
    _programar(
        background_tasks,
        order.client.email,
        f"Tu pedido #{order.order_id} {estado}",
        "cambio_estado",
        {**datos, "estado": estado, "detalle_estado": detalle},
    )


# =====================================================
# Stock y precios
# =====================================================


def notificar_vuelta_de_stock(
    db: Session, part: Part, stock_anterior: int, background_tasks: BackgroundTasks | None = None
) -> int:
    """Llamar después de cambiar `part.stock` (reposición del vendedor o
    cancelación de un pedido). Si pasó de 0 a más, avisa a los suscritos
    y borra las suscripciones. Devuelve a cuántos avisó."""
    if stock_anterior > 0 or part.stock <= 0:
        return 0

    alertas = db.scalars(
        select(StockAlert).where(StockAlert.part_id == part.id).options(selectinload(StockAlert.client))
    ).all()
    for alerta in alertas:
        _programar(
            background_tasks,
            alerta.client.email,
            f"Volvió a haber stock de {part.name}",
            "vuelta_stock",
            {
                "nombre": alerta.client.name,
                "repuesto": part.name,
                "precio": precio(part.price),
                "enlace": _enlace_repuesto(part),
            },
        )
        db.delete(alerta)
    db.commit()
    return len(alertas)


def notificar_baja_de_precio(
    db: Session, part: Part, precio_anterior: int, background_tasks: BackgroundTasks | None = None
) -> int:
    """Llamar después de cambiar `part.price`. Si bajó, avisa a quienes lo
    tienen en favoritos y no se dieron de baja. Devuelve a cuántos avisó."""
    if part.price >= precio_anterior:
        return 0

    clientes = db.scalars(
        select(Client)
        .join(Favorite, Favorite.client_id == Client.user_id)
        .where(Favorite.part_id == part.id, Client.marketing_emails.is_(True))
    ).all()
    for client in clientes:
        _programar(
            background_tasks,
            client.email,
            f"Bajó el precio de {part.name}",
            "baja_precio",
            {
                "nombre": client.name,
                "repuesto": part.name,
                "precio_anterior": precio(precio_anterior),
                "precio": precio(part.price),
                "enlace": _enlace_repuesto(part),
            },
            enlace_baja=enlace_baja(client),
        )
    return len(clientes)


# =====================================================
# Tareas diarias (scripts/tareas_diarias.py)
# =====================================================


def recordar_carritos_abandonados(db: Session, ahora: datetime | None = None) -> int:
    """Un recordatorio por carrito con productos que no se tocó en 24 horas.
    Si el cliente lo vuelve a tocar y lo deja otra vez, recibe otro."""
    ahora = ahora or datetime.now(timezone.utc)
    limite = ahora - timedelta(hours=HORAS_CARRITO_ABANDONADO)

    carritos = db.scalars(
        select(Cart)
        .join(Client, Client.user_id == Cart.client_id)
        .where(Client.marketing_emails.is_(True), Cart.items.any())
        .options(selectinload(Cart.client), selectinload(Cart.items).selectinload(CartItem.part))
    ).all()

    enviados = 0
    for cart in carritos:
        actualizado = _como_utc(cart.updated_at)
        ya_avisado = cart.reminder_sent_at is not None and _como_utc(cart.reminder_sent_at) >= actualizado
        if actualizado > limite or ya_avisado:
            continue

        enviar_mail(
            cart.client.email,
            "Te quedó algo en el carrito",
            "carrito_abandonado",
            {
                "nombre": cart.client.name,
                "items": [{"nombre": item.part.name, "cantidad": item.amount} for item in cart.items],
                "enlace": f"{FRONTEND_URL}/carrito",
            },
            enlace_baja=enlace_baja(cart.client),
        )
        cart.reminder_sent_at = ahora
        enviados += 1

    db.commit()
    return enviados


def _meses_de(part: Part) -> int | None:
    return next(
        (meses for prefijo, meses in MESES_MANTENIMIENTO.items() if part.name.startswith(prefijo)),
        None,
    )


def recordar_mantenimientos(db: Session, ahora: datetime | None = None) -> int:
    """Un recordatorio por repuesto comprado cuyo plazo de cambio se cumplió
    en los últimos 7 días. Pedidos cancelados no cuentan, y si el cliente
    volvió a comprar el mismo repuesto, el recordatorio es el de la compra
    nueva."""
    ahora = ahora or datetime.now(timezone.utc)
    mas_viejo = _sumar_meses(ahora, -max(MESES_MANTENIMIENTO.values())) - timedelta(days=DIAS_VENTANA_MANTENIMIENTO)

    items = db.scalars(
        select(OrderItem)
        .join(Order, Order.order_id == OrderItem.order_id)
        .join(Client, Client.user_id == Order.client_id)
        .where(
            OrderItem.reminder_sent_at.is_(None),
            Order.status != OrderStatus.CANCELLED,
            Order.created_at >= mas_viejo,
            Client.marketing_emails.is_(True),
        )
        .options(selectinload(OrderItem.part), selectinload(OrderItem.order).selectinload(Order.client))
    ).all()

    ultima_compra = {
        (client_id, part_id): _como_utc(fecha)
        for client_id, part_id, fecha in db.execute(
            select(Order.client_id, OrderItem.part_id, func.max(Order.created_at))
            .join(OrderItem, OrderItem.order_id == Order.order_id)
            .where(Order.status != OrderStatus.CANCELLED)
            .group_by(Order.client_id, OrderItem.part_id)
        )
    }

    enviados = 0
    for item in items:
        meses = _meses_de(item.part)
        if meses is None:
            continue
        comprado = _como_utc(item.order.created_at)
        if ultima_compra[(item.order.client_id, item.part_id)] > comprado:
            continue
        vence = _sumar_meses(comprado, meses)
        if not ahora - timedelta(days=DIAS_VENTANA_MANTENIMIENTO) <= vence <= ahora:
            continue

        client = item.order.client
        enviar_mail(
            client.email,
            f"¿Toca cambiar {item.part.name}?",
            "recordatorio_mantenimiento",
            {
                "nombre": client.name,
                "repuesto": item.part.name,
                "meses": meses,
                "enlace": _enlace_repuesto(item.part),
            },
            enlace_baja=enlace_baja(client),
        )
        item.reminder_sent_at = ahora
        enviados += 1

    db.commit()
    return enviados


TAREAS_DIARIAS: dict[str, Callable[[Session, datetime | None], int]] = {
    "Carritos abandonados": recordar_carritos_abandonados,
    "Recordatorios de mantenimiento": recordar_mantenimientos,
}
