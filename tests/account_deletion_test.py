import re

import pytest
from sqlalchemy import select

from app.crud.analytics import units_sold_total
from app.core.security import create_access_token, hash_password
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress
from app.models.stock_alert import StockAlert
from app.models.user import User

DELETE_ACCOUNT = "/api/v1/users/me"
REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
PASSWORD = "secreto123"


def make_client(db_session, email="ana@example.com"):
    client = Client(
        username="ana",
        password=hash_password(PASSWORD),
        name="Ana Pérez",
        email=email,
        email_verified=True,
        phone="+59899123456",
    )
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


def auth_headers(client):
    token = create_access_token(
        subject=str(client.user_id),
        extra_claims={
            "user_type": "client",
            "sv": client.session_version,
        },
    )
    return {"Authorization": f"Bearer {token}"}


def make_order(db_session, client, status, payment_status):
    part = Part(
        part_code=f"BRK-{client.user_id}",
        name="Pastillas de freno",
        manufacturer="Bosch",
        category="Frenos",
        price=1000,
        stock=5,
    )
    order = Order(
        client_id=client.user_id,
        status=status,
        ship_personal_name="Ana Pérez",
        ship_street="Av. Italia",
        ship_number="1234",
        ship_apartment="101",
        ship_city="Montevideo",
        ship_department="Montevideo",
        ship_postal_code="11600",
        payment_method_label="Mercado Pago",
        payment=Payment(status=payment_status),
    )
    order.items.append(OrderItem(part=part, quantity=1, frozen_price=1000))
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def add_personal_data(db_session, client):
    part = Part(
        part_code=f"FLT-{client.user_id}",
        name="Filtro de aire",
        manufacturer="Bosch",
        category="Filtros",
        price=500,
        stock=3,
    )
    address = ShippingAddress(
        client_id=client.user_id,
        personal_name="Ana Pérez",
        street="Goes",
        number="2297",
        city="Montevideo",
        department="Montevideo",
        is_primary=True,
    )
    cart = Cart(client_id=client.user_id)
    db_session.add_all([part, address, cart])
    db_session.flush()
    db_session.add_all(
        [
            CartItem(cart_id=client.user_id, part_id=part.id, amount=1),
            Favorite(client_id=client.user_id, part_id=part.id),
            StockAlert(client_id=client.user_id, part_id=part.id),
        ]
    )
    db_session.commit()


def test_delete_account_requires_client_authentication(client):
    response = client.request("DELETE", DELETE_ACCOUNT, json={"password": PASSWORD})

    assert response.status_code == 401


def test_delete_account_with_wrong_password_changes_nothing(client, db_session):
    customer = make_client(db_session)
    add_personal_data(db_session, customer)
    original_name, original_email = customer.name, customer.email

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": "incorrecta123"},
        headers=auth_headers(customer),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "La contraseña es incorrecta."
    db_session.expire_all()
    customer = db_session.get(Client, customer.user_id)
    assert (customer.name, customer.email) == (original_name, original_email)
    assert db_session.query(ShippingAddress).count() == 1
    assert db_session.query(Favorite).count() == 1
    assert db_session.query(StockAlert).count() == 1
    assert db_session.query(Cart).count() == 1


@pytest.mark.parametrize(
    "order_status,payment_status",
    [
        (OrderStatus.CONFIRMED, PaymentStatus.PENDING),
        (OrderStatus.SHIPPED, PaymentStatus.APPROVED),
        (OrderStatus.CONFIRMED, PaymentStatus.APPROVED),
        (OrderStatus.SHIPPED, PaymentStatus.PENDING),
    ],
)
def test_ongoing_order_blocks_deletion_without_changes(
    client, db_session, order_status, payment_status
):
    customer = make_client(db_session)
    add_personal_data(db_session, customer)
    make_order(db_session, customer, order_status, payment_status)
    original_name, original_email = customer.name, customer.email

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Tenés que esperar a que se entregue tu pedido."
    db_session.expire_all()
    customer = db_session.get(Client, customer.user_id)
    assert (customer.name, customer.email) == (original_name, original_email)
    assert db_session.query(ShippingAddress).count() == 1
    assert db_session.query(Favorite).count() == 1
    assert db_session.query(StockAlert).count() == 1
    assert db_session.query(Cart).count() == 1


@pytest.mark.parametrize(
    "order_status,payment_status",
    [
        (OrderStatus.DELIVERED, PaymentStatus.APPROVED),
        (OrderStatus.CANCELLED, PaymentStatus.PENDING),
    ],
)
def test_delete_account_retains_closed_orders_but_anonymizes_customer_data(
    client, db_session, order_status, payment_status
):
    customer = make_client(db_session)
    add_personal_data(db_session, customer)
    order = make_order(db_session, customer, order_status, payment_status)
    user_id, order_id = customer.user_id, order.order_id
    part_id = order.items[0].part_id
    headers = auth_headers(customer)

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=headers,
    )

    assert response.status_code == 204
    db_session.expire_all()
    customer = db_session.get(Client, user_id)
    order = db_session.get(Order, order_id)
    assert customer.email == f"eliminado-{user_id}@autobought.invalid"
    assert re.fullmatch(r"Cliente eliminado \d+-[0-9a-f]{12}", customer.name)
    assert customer.username == "ana"
    assert customer.password and customer.password.startswith("$2")
    assert customer.phone is None
    assert customer.email_verified is False
    assert customer.session_version == 1
    assert order is not None
    assert order.client_id == user_id
    assert order.status == order_status
    assert order.payment.status == payment_status
    assert order.ship_personal_name == customer.name
    assert order.ship_street == "Eliminado"
    assert order.ship_number == "0"
    assert order.ship_apartment is None
    assert order.ship_city == "Eliminado"
    assert order.ship_department == "Eliminado"
    assert order.ship_postal_code is None
    if order_status == OrderStatus.DELIVERED:
        assert units_sold_total(db_session, part_id) == 1
    assert db_session.query(ShippingAddress).count() == 0
    assert db_session.query(Favorite).count() == 0
    assert db_session.query(StockAlert).count() == 0
    assert db_session.query(Cart).count() == 0
    assert db_session.query(CartItem).count() == 0

    # The former session is revoked and the old email no longer authenticates.
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    login = client.post(LOGIN, json={"email": "ana@example.com", "password": PASSWORD})
    assert login.status_code == 401
    anonymous_login = client.post(
        LOGIN,
        json={
            "email": f"eliminado-{user_id}@autobought.invalid",
            "password": PASSWORD,
        },
    )
    assert anonymous_login.status_code == 422


def test_rejected_payment_does_not_count_as_an_ongoing_order(client, db_session):
    customer = make_client(db_session)
    make_order(
        db_session,
        customer,
        OrderStatus.CONFIRMED,
        PaymentStatus.REJECTED,
    )

    response = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )

    assert response.status_code == 204


def test_deleted_account_can_register_again_with_original_email(client, db_session):
    customer = make_client(db_session)
    make_order(
        db_session,
        customer,
        OrderStatus.DELIVERED,
        PaymentStatus.APPROVED,
    )
    old_user_id = customer.user_id

    deleted = client.request(
        "DELETE",
        DELETE_ACCOUNT,
        json={"password": PASSWORD},
        headers=auth_headers(customer),
    )
    registered = client.post(
        REGISTER,
        json={
            "name": "Ana Nueva",
            "email": "ana@example.com",
            "phone": "099 123 456",
            "password": PASSWORD,
        },
    )

    assert deleted.status_code == 204
    assert registered.status_code == 201
    new_customer = db_session.scalars(
        select(Client).where(Client.email == "ana@example.com")
    ).one()
    assert new_customer.user_id != old_user_id
    assert new_customer.name == "Ana Nueva"
    assert db_session.query(Order).filter_by(client_id=new_customer.user_id).count() == 0
    assert db_session.query(Order).filter_by(client_id=old_user_id).count() == 1
