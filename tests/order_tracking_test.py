"""SCRUM-172: el cliente sigue su pedido (línea de tiempo con el historial
de estados) y confirma que lo recibió."""

from datetime import datetime, timedelta, timezone

import pytest

from app.crud.order import change_status, cancel_expired_orders, reactivate_paid_order
from app.models.order import Order, OrderStatus
from app.models.order_status_history import CancelReason, OrderStatusHistory
from app.models.payment import Payment
from order_test import auth_headers, make_address, make_cart, make_client, make_part


@pytest.fixture
def order_data(client, db_session):
    """Un pedido recién confirmado y los headers de su cliente."""
    customer = make_client(db_session)
    make_address(db_session, customer)
    make_cart(db_session, customer, [(make_part(db_session, stock=5, price=1500), 2)])
    headers = auth_headers(customer)
    order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]
    return order_id, headers


def move_to(db_session, order_id, *states, motivo=None):
    """Lo que hará el vendedor desde su panel (SCRUM-171)."""
    order = db_session.get(Order, order_id)
    for state in states:
        change_status(order, state, motivo)
    db_session.commit()


def detail(client, order_id, headers):
    return client.get(f"/api/v1/orders/{order_id}", headers=headers).json()


def states(body):
    return [step["status"] for step in body["status_history"]]


def received(client, order_id, headers):
    return client.post(f"/api/v1/orders/{order_id}/recibido", headers=headers)


# =====================================================
# Línea de tiempo
# =====================================================


def test_to_the_buy_the_history_starts_in_confirmed_with_the_date(client, db_session, order_data):
    order_id, headers = order_data

    body = detail(client, order_id, headers)

    assert states(body) == ["confirmed"]
    when = datetime.fromisoformat(body["status_history"][0]["changed_at"])
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    assert abs(datetime.now(timezone.utc) - when) < timedelta(minutes=1)
    assert body["cancel_reason"] is None


def test_the_line_of_time_has_each_stage_in_order(client, db_session, order_data):
    order_id, headers = order_data
    move_to(db_session, order_id, OrderStatus.PACKING, OrderStatus.SHIPPED)

    body = detail(client, order_id, headers)

    assert body["status"] == "shipped"
    assert states(body) == ["confirmed", "packing", "shipped"]
    assert all(step["changed_at"] for step in body["status_history"])


def test_the_history_also_goes_out_in_the_list_of_orders(client, db_session, order_data):
    order_id, headers = order_data
    move_to(db_session, order_id, OrderStatus.PACKING)

    body = client.get("/api/v1/orders", headers=headers).json()

    assert states(body["orders"][0]) == ["confirmed", "packing"]


def test_a_order_expired_says_that_cancelled_by_no_being_paid(client, db_session, order_data):
    order_id, headers = order_data
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()

    body = detail(client, order_id, headers)

    assert states(body) == ["confirmed", "cancelled"]
    assert body["cancel_reason"] == "expired"


def test_a_order_cancelled_by_the_store_it_says(client, db_session, order_data):
    order_id, headers = order_data
    move_to(db_session, order_id, OrderStatus.CANCELLED, motivo=CancelReason.STORE)

    body = detail(client, order_id, headers)

    assert body["cancel_reason"] == "store"


def test_a_payment_late_with_stock_returns_a_confirm_the_order_in_the_history(client, db_session, order_data):
    order_id, _ = order_data
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    db_session.commit()
    cancel_expired_orders(db_session)

    order = db_session.get(Order, order_id)
    assert reactivate_paid_order(db_session, order)
    db_session.commit()

    db_session.expire_all()
    historial = db_session.query(OrderStatusHistory).filter_by(order_id=order_id).order_by(OrderStatusHistory.id)
    assert [row.status for row in historial] == [
        OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.CONFIRMED,
    ]


def test_a_order_without_history_shows_the_purchase_and_the_status_current(client, db_session, order_data):
    # Los pedidos de antes del historial (o los del seed) no tienen filas.
    order_id, headers = order_data
    db_session.query(OrderStatusHistory).delete()
    db_session.get(Order, order_id).status = OrderStatus.SHIPPED
    db_session.commit()

    body = detail(client, order_id, headers)

    assert states(body) == ["confirmed", "shipped"]
    assert body["status_history"][0]["changed_at"] is not None
    # No se sabe cuándo se envió.
    assert body["status_history"][1]["changed_at"] is None


def test_a_order_old_cancelled_without_pay_considers_expired(client, db_session, order_data):
    order_id, headers = order_data
    db_session.query(OrderStatusHistory).delete()
    db_session.get(Order, order_id).status = OrderStatus.CANCELLED
    db_session.commit()

    assert detail(client, order_id, headers)["cancel_reason"] == "expired"


# =====================================================
# «Ya lo recibí»
# =====================================================


def test_confirm_the_arrival_of_a_order_shipped_it_delivery_and_sends_the_mail(client, db_session, order_data, sent_mails):
    order_id, headers = order_data
    move_to(db_session, order_id, OrderStatus.PACKING, OrderStatus.SHIPPED)

    response = received(client, order_id, headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "delivered"
    assert states(body) == ["confirmed", "packing", "shipped", "delivered"]
    assert db_session.get(Order, order_id).status == OrderStatus.DELIVERED
    assert [mail_message["Subject"] for mail_message in sent_mails] == [f"Tu pedido #{order_id} fue entregado"]


@pytest.mark.parametrize(
    "camino",
    [[], [OrderStatus.PACKING], [OrderStatus.SHIPPED, OrderStatus.DELIVERED], [OrderStatus.CANCELLED]],
    ids=["confirmado", "empaquetando", "ya-entregado", "cancelado"],
)
def test_only_confirms_the_arrival_of_a_order_shipped(client, db_session, order_data, sent_mails, camino):
    order_id, headers = order_data
    move_to(db_session, order_id, *camino)
    antes = states(detail(client, order_id, headers))

    response = received(client, order_id, headers)

    assert response.status_code == 409
    assert states(detail(client, order_id, headers)) == antes
    assert sent_mails == []


def test_confirm_the_arrival_of_a_order_foreign_gives_404(client, db_session, order_data, sent_mails):
    order_id, _ = order_data
    move_to(db_session, order_id, OrderStatus.SHIPPED)
    other = make_client(db_session, username="beto", email="beto@example.com")

    response = received(client, order_id, auth_headers(other))

    assert response.status_code == 404
    assert db_session.get(Order, order_id).status == OrderStatus.SHIPPED
    assert sent_mails == []


def test_confirm_the_arrival_without_session_gives_401(client, db_session, order_data):
    order_id, _ = order_data

    assert received(client, order_id, {}).status_code == 401
