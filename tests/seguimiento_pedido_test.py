"""SCRUM-172: el cliente sigue su pedido (línea de tiempo con el historial
de estados) y confirma que lo recibió."""

from datetime import datetime, timedelta, timezone

import pytest

from app.crud.order import cambiar_estado, cancel_expired_orders, reactivate_paid_order
from app.models.order import Order, OrderStatus
from app.models.order_status_history import CancelReason, OrderStatusHistory
from app.models.payment import Payment
from order_test import auth_headers, make_address, make_cart, make_client, make_part


@pytest.fixture
def pedido(client, db_session):
    """Un pedido recién confirmado y los headers de su cliente."""
    cliente = make_client(db_session)
    make_address(db_session, cliente)
    make_cart(db_session, cliente, [(make_part(db_session, stock=5, price=1500), 2)])
    headers = auth_headers(cliente)
    order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]
    return order_id, headers


def pasar_a(db_session, order_id, *estados, motivo=None):
    """Lo que hará el vendedor desde su panel (SCRUM-171)."""
    order = db_session.get(Order, order_id)
    for estado in estados:
        cambiar_estado(order, estado, motivo)
    db_session.commit()


def detalle(client, order_id, headers):
    return client.get(f"/api/v1/orders/{order_id}", headers=headers).json()


def estados(body):
    return [paso["status"] for paso in body["status_history"]]


def recibido(client, order_id, headers):
    return client.post(f"/api/v1/orders/{order_id}/recibido", headers=headers)


# =====================================================
# Línea de tiempo
# =====================================================


def test_al_comprar_el_historial_arranca_en_confirmado_con_la_fecha(client, db_session, pedido):
    order_id, headers = pedido

    body = detalle(client, order_id, headers)

    assert estados(body) == ["confirmed"]
    fecha = datetime.fromisoformat(body["status_history"][0]["changed_at"])
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    assert abs(datetime.now(timezone.utc) - fecha) < timedelta(minutes=1)
    assert body["cancel_reason"] is None


def test_la_linea_de_tiempo_tiene_cada_etapa_en_orden(client, db_session, pedido):
    order_id, headers = pedido
    pasar_a(db_session, order_id, OrderStatus.PACKING, OrderStatus.SHIPPED)

    body = detalle(client, order_id, headers)

    assert body["status"] == "shipped"
    assert estados(body) == ["confirmed", "packing", "shipped"]
    assert all(paso["changed_at"] for paso in body["status_history"])


def test_el_historial_tambien_sale_en_la_lista_de_pedidos(client, db_session, pedido):
    order_id, headers = pedido
    pasar_a(db_session, order_id, OrderStatus.PACKING)

    body = client.get("/api/v1/orders", headers=headers).json()

    assert estados(body["orders"][0]) == ["confirmed", "packing"]


def test_un_pedido_vencido_dice_que_se_cancelo_por_no_pagarse(client, db_session, pedido):
    order_id, headers = pedido
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()

    body = detalle(client, order_id, headers)

    assert estados(body) == ["confirmed", "cancelled"]
    assert body["cancel_reason"] == "expired"


def test_un_pedido_cancelado_por_la_tienda_lo_dice(client, db_session, pedido):
    order_id, headers = pedido
    pasar_a(db_session, order_id, OrderStatus.CANCELLED, motivo=CancelReason.STORE)

    body = detalle(client, order_id, headers)

    assert body["cancel_reason"] == "store"


def test_un_pago_tardio_con_stock_vuelve_a_confirmar_el_pedido_en_el_historial(client, db_session, pedido):
    order_id, _ = pedido
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()
    cancel_expired_orders(db_session)

    order = db_session.get(Order, order_id)
    assert reactivate_paid_order(db_session, order)
    db_session.commit()

    db_session.expire_all()
    historial = db_session.query(OrderStatusHistory).filter_by(order_id=order_id).order_by(OrderStatusHistory.id)
    assert [fila.status for fila in historial] == [
        OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.CONFIRMED,
    ]


def test_un_pedido_sin_historial_muestra_la_compra_y_el_estado_actual(client, db_session, pedido):
    # Los pedidos de antes del historial (o los del seed) no tienen filas.
    order_id, headers = pedido
    db_session.query(OrderStatusHistory).delete()
    db_session.get(Order, order_id).status = OrderStatus.SHIPPED
    db_session.commit()

    body = detalle(client, order_id, headers)

    assert estados(body) == ["confirmed", "shipped"]
    assert body["status_history"][0]["changed_at"] is not None
    # No se sabe cuándo se envió.
    assert body["status_history"][1]["changed_at"] is None


def test_un_pedido_viejo_cancelado_sin_pagar_se_considera_vencido(client, db_session, pedido):
    order_id, headers = pedido
    db_session.query(OrderStatusHistory).delete()
    db_session.get(Order, order_id).status = OrderStatus.CANCELLED
    db_session.commit()

    assert detalle(client, order_id, headers)["cancel_reason"] == "expired"


# =====================================================
# «Ya lo recibí»
# =====================================================


def test_confirmar_la_llegada_de_un_pedido_enviado_lo_entrega_y_manda_el_mail(client, db_session, pedido, mails):
    order_id, headers = pedido
    pasar_a(db_session, order_id, OrderStatus.PACKING, OrderStatus.SHIPPED)

    response = recibido(client, order_id, headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "delivered"
    assert estados(body) == ["confirmed", "packing", "shipped", "delivered"]
    assert db_session.get(Order, order_id).status == OrderStatus.DELIVERED
    assert [mail["Subject"] for mail in mails] == [f"Tu pedido #{order_id} fue entregado"]


@pytest.mark.parametrize(
    "camino",
    [[], [OrderStatus.PACKING], [OrderStatus.SHIPPED, OrderStatus.DELIVERED], [OrderStatus.CANCELLED]],
    ids=["confirmado", "empaquetando", "ya-entregado", "cancelado"],
)
def test_solo_se_confirma_la_llegada_de_un_pedido_enviado(client, db_session, pedido, mails, camino):
    order_id, headers = pedido
    pasar_a(db_session, order_id, *camino)
    antes = estados(detalle(client, order_id, headers))

    response = recibido(client, order_id, headers)

    assert response.status_code == 409
    assert estados(detalle(client, order_id, headers)) == antes
    assert mails == []


def test_confirmar_la_llegada_de_un_pedido_ajeno_da_404(client, db_session, pedido, mails):
    order_id, _ = pedido
    pasar_a(db_session, order_id, OrderStatus.SHIPPED)
    otro = make_client(db_session, username="beto", email="beto@example.com")

    response = recibido(client, order_id, auth_headers(otro))

    assert response.status_code == 404
    assert db_session.get(Order, order_id).status == OrderStatus.SHIPPED
    assert mails == []


def test_confirmar_la_llegada_sin_sesion_da_401(client, db_session, pedido):
    order_id, _ = pedido

    assert recibido(client, order_id, {}).status_code == 401
