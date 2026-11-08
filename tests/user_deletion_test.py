"""Tests de la baja y anonimización de una cuenta de cliente."""

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password, verify_password
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.employee import Employee
from app.models.favorite import Favorite
from app.models.auth_attempt import AuthAttempt
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.payment import Payment, PaymentStatus
from app.models.part import Part
from app.models.shipping_address import ShippingAddress
from app.models.stock_alert import StockAlert

DELETE_ACCOUNT = "/api/v1/users/me"
REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"

PASSWORD = "secreto123"


def make_client(db_session):
    client = Client(
        username="ana",
        password=hash_password(PASSWORD),
        name="Ana Pérez",
        email="ana@example.com",
        phone="+59899123456",
        email_verified=True,
    )
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


def auth_headers(client):
    token = create_access_token(
        subject=str(client.user_id),
        extra_claims={"user_type": "client", "sv": client.session_version},
    )
    return {"Authorization": f"Bearer {token}"}


def employee_headers(db_session):
    employee = Employee(
        username="vendedor",
        password=hash_password("vendedor123"),
        name="Vendedor",
        email="vendedor@example.com",
    )
    db_session.add(employee)
    db_session.commit()
    token = create_access_token(
        subject=str(employee.user_id),
        extra_claims={"user_type": "employee", "sv": employee.session_version},
    )
    return {"Authorization": f"Bearer {token}"}


def make_part(db_session):
    part = Part(
        part_code="BRK-001",
        name="Pastillas de freno",
        manufacturer="Bosch",
        category="Brakes",
        price=1000,
        stock=5,
    )
    db_session.add(part)
    db_session.commit()
    return part


def make_order(
    db_session,
    client,
    *,
    status=OrderStatus.DELIVERED,
    payment_status=PaymentStatus.APPROVED,
):
    address = ShippingAddress(
        client_id=client.user_id,
        personal_name="Ana Pérez",
        street="Av. Italia",
        number="1234",
        city="Montevideo",
        department="Montevideo",
        is_primary=True,
    )
    db_session.add(address)
    db_session.flush()

    order = Order(
        client_id=client.user_id,
        status=status,
        shipping_address_id=address.shipping_address_id,
        ship_personal_name="Ana Pérez",
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Mercado Pago",
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(Payment(order_id=order.order_id, status=payment_status))
    db_session.commit()
    db_session.refresh(order)
    return order, address


def test_delete_account_anonymizes_user_and_removes_client_data(client, db_session):
    customer = make_client(db_session)
    part = make_part(db_session)
    order, address = make_order(db_session, customer)

    cart = Cart(client_id=customer.user_id)
    db_session.add(cart)
    db_session.flush()
    db_session.add_all(
        [
            CartItem(cart_id=customer.user_id, part_id=part.id, amount=2),
            Favorite(client_id=customer.user_id, part_id=part.id),
            StockAlert(client_id=customer.user_id, part_id=part.id),
            AuthAttempt(email="ana@example.com", failed_attempts=1),
            AuthAttempt(email="mail:verificar:ana@example.com", failed_attempts=1),
            AuthAttempt(email="mail:recuperar:ana@example.com", failed_attempts=1),
        ]
    )
    original_user_id = customer.user_id
    original_order_id = order.order_id
    address_id = address.shipping_address_id
    original_session_version = customer.session_version
    headers = auth_headers(customer)
    db_session.commit()

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=headers,
    )

    assert response.status_code == 204
    db_session.expire_all()
    deleted = db_session.get(Client, original_user_id)
    assert deleted is not None
    assert deleted.email == f"eliminado-{original_user_id}@autobought.invalid"
    assert deleted.name != "Ana Pérez"
    assert deleted.username != "ana"
    assert deleted.phone is None
    assert deleted.email_verified is False
    assert deleted.marketing_emails is False
    assert deleted.session_version == original_session_version + 1
    assert not verify_password(PASSWORD, deleted.password)

    assert db_session.get(Order, original_order_id) is not None
    assert db_session.get(Order, original_order_id).client_id == original_user_id
    assert db_session.get(Order, original_order_id).ship_personal_name != "Ana Pérez"
    assert db_session.get(Order, original_order_id).shipping_address_id is None
    assert db_session.get(ShippingAddress, address_id) is None
    assert db_session.get(Cart, original_user_id) is None
    assert db_session.scalars(
        select(CartItem).where(CartItem.cart_id == original_user_id)
    ).all() == []
    assert db_session.scalars(
        select(Favorite).where(Favorite.client_id == original_user_id)
    ).all() == []
    assert db_session.scalars(
        select(StockAlert).where(StockAlert.client_id == original_user_id)
    ).all() == []
    assert db_session.scalars(
        select(AuthAttempt).where(AuthAttempt.email.contains("ana@example.com"))
    ).all() == []

    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.post(
        LOGIN,
        json={
            "email": f"eliminado-{original_user_id}@autobought.invalid",
            "password": PASSWORD,
        },
    ).status_code != 200


def test_deleted_client_can_register_again_without_old_orders(client, db_session):
    customer = make_client(db_session)
    order, _ = make_order(db_session, customer)
    original_order_id = order.order_id
    original_user_id = customer.user_id

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 204
    assert client.post(
        LOGIN,
        json={"email": "ana@example.com", "password": PASSWORD},
    ).status_code == 401
    registration = client.post(
        REGISTER,
        json={
            "name": "Ana Pérez",
            "email": "ana@example.com",
            "phone": "099 123 456",
            "password": PASSWORD,
        },
    )

    assert registration.status_code == 201
    claims = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {registration.json()['access_token']}"},
    )
    assert claims.status_code == 200
    assert claims.json()["user_id"] != original_user_id
    assert db_session.get(Order, original_order_id).client_id == original_user_id
    assert client.get(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {registration.json()['access_token']}"},
    ).json()["orders"] == []


def test_account_deletion_keeps_delivered_sales_but_removes_customer_identity(client, db_session):
    customer = make_client(db_session)
    order, _ = make_order(db_session, customer)
    part = make_part(db_session)
    db_session.add(
        OrderItem(
            order_id=order.order_id,
            part_id=part.id,
            quantity=2,
            frozen_price=1000,
        )
    )
    db_session.commit()
    old_email = customer.email
    order_id = order.order_id
    staff_headers = employee_headers(db_session)

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 204
    retained_order = db_session.get(Order, order_id)
    retained_client = db_session.get(Client, customer.user_id)
    assert retained_order is not None
    assert retained_client.name != "Ana Pérez"
    assert retained_client.email != old_email
    assert retained_order.ship_personal_name != "Ana Pérez"
    assert retained_client.email.endswith("@autobought.invalid")
    seller_orders = client.get("/api/v1/orders/seller", headers=staff_headers).json()["orders"]
    retained_sale = next(row for row in seller_orders if row["order_id"] == order_id)
    assert retained_sale["client_name"] == retained_client.name
    assert retained_sale["client_email"] == retained_client.email
    assert retained_sale["client_phone"] is None

    dashboard = client.get("/api/v1/analytics/best-sellers", headers=staff_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["parts"][0]["units_sold"] == 2


@pytest.mark.parametrize(
    "payment_status",
    [PaymentStatus.PENDING, PaymentStatus.APPROVED],
)
def test_account_deletion_is_rejected_for_paid_ongoing_order(client, db_session, payment_status):
    customer = make_client(db_session)
    order, address = make_order(
        db_session,
        customer,
        status=OrderStatus.SHIPPED,
        payment_status=payment_status,
    )
    original_email = customer.email
    original_password_hash = customer.password

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 409
    assert "entreg" in response.json()["detail"].lower()
    db_session.expire_all()
    assert db_session.get(Client, customer.user_id).email == original_email
    assert db_session.get(Client, customer.user_id).password == original_password_hash
    assert db_session.get(Order, order.order_id) is not None
    assert db_session.get(ShippingAddress, address.shipping_address_id) is not None
    assert client.post(
        LOGIN,
        json={"email": original_email, "password": PASSWORD},
    ).status_code == 200


def test_account_deletion_is_allowed_for_cancelled_order(client, db_session):
    customer = make_client(db_session)
    order, _ = make_order(
        db_session,
        customer,
        status=OrderStatus.CANCELLED,
        payment_status=PaymentStatus.APPROVED,
    )

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 204
    assert db_session.get(Order, order.order_id) is not None


def test_account_deletion_rejects_incorrect_password_without_changes(client, db_session):
    customer = make_client(db_session)
    order, address = make_order(db_session, customer)
    original_email = customer.email
    original_password_hash = customer.password

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": "incorrecta123"},
        headers=auth_headers(customer),
    )

    assert response.status_code == 400
    assert "contraseña" in response.json()["detail"].lower()
    db_session.expire_all()
    assert db_session.get(Client, customer.user_id).email == original_email
    assert db_session.get(Client, customer.user_id).password == original_password_hash
    assert db_session.get(Order, order.order_id) is not None
    assert db_session.get(ShippingAddress, address.shipping_address_id) is not None


def test_anonymized_email_and_old_password_cannot_log_in(client, db_session):
    customer = make_client(db_session)
    original_user_id = customer.user_id
    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 204
    assert client.post(
        LOGIN,
        json={
            "email": f"eliminado-{original_user_id}@autobought.invalid",
            "password": PASSWORD,
        },
    ).status_code != 200


def test_account_deletion_requires_client_authentication(client):
    response = client.request("DELETE", DELETE_ACCOUNT, json={"password": PASSWORD})

    assert response.status_code == 401
