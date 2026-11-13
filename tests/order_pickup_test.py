"""Retiro: sin dirección, secuencia propia y aviso al cliente."""

from app.models.order import DeliveryMethod, Order, OrderStatus
from app.models.payment import PaymentStatus
from order_test import auth_headers, make_cart, make_client, make_part
from order_status_test import change_order_status, make_order_for, seller, customer, brake_pads, mp

ORDERS = "/api/v1/orders"


def test_buy_with_pickup_needs_no_address(client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.orders.LOCAL_ADDRESS", "Av. Ejemplo 123")
    monkeypatch.setattr("app.api.v1.endpoints.orders.LOCAL_HOURS", "Lunes a viernes, 9 a 18")
    customer = make_client(db_session)
    part = make_part(db_session)
    make_cart(db_session, customer, [(part, 1)])
    response = client.post(ORDERS, headers=auth_headers(customer), json={"delivery_method": "pickup"})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["delivery_method"] == "pickup"
    assert result["shipping_address"] is None
    order = db_session.get(Order, result["order_id"])
    assert order.shipping_address_id is None
    assert order.ship_street is None


def test_pickup_status_flow_and_email(client, db_session, seller, customer, brake_pads, sent_mails, mp, monkeypatch):
    from app.core import notifications
    monkeypatch.setattr(notifications, "LOCAL_ADDRESS", "Av. Ejemplo 123, Montevideo")
    monkeypatch.setattr(notifications, "LOCAL_HOURS", "Lunes a viernes, 9 a 18")
    oid = make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.APPROVED)
    order = db_session.get(Order, oid)
    order.delivery_method = DeliveryMethod.PICKUP
    db_session.commit()
    assert change_order_status(client, seller, oid, "packing").status_code == 200
    result = change_order_status(client, seller, oid, "ready_for_pickup")
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "ready_for_pickup"
    assert result.json()["next_status"] == "delivered"
    assert change_order_status(client, seller, oid, "shipped").status_code == 409
    messages = [m.get_body(preferencelist=("plain",)).get_content() for m in sent_mails]
    assert any("Av. Ejemplo 123" in m and "Lunes a viernes" in m and "listo para retirar" in m for m in messages)
    assert change_order_status(client, seller, oid, "delivered").status_code == 200

def test_packing_email_for_pickup_does_not_mention_address(client, db_session, seller, customer, brake_pads, sent_mails, mp):
    oid = make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.APPROVED)
    order = db_session.get(Order, oid)
    order.delivery_method = DeliveryMethod.PICKUP
    db_session.commit()
    assert change_order_status(client, seller, oid, "packing").status_code == 200
    messages = [m.get_body(preferencelist=("plain",)).get_content() for m in sent_mails]
    assert any("listo para retirar" in m for m in messages)
    assert not any("para tu dirección" in m for m in messages)