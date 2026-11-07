"""Tests de los endpoints del dashboard del vendedor."""

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import create_access_token, hash_password
from app.crud import user as crud_user
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part

PING = "/api/v1/analytics/ping"


def _token(subject, user_type, minutes_count=5):
    payload = {
        "sub": str(subject),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes_count),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _seller(db_session):
    return crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )


def _customer(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


def test_ping_with_token_of_seller_returns_200(client, db_session):
    seller = _seller(db_session)

    response = client.get(PING, headers=_headers(_token(seller.user_id, "employee")))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ping_with_token_of_customer_returns_403(client, db_session):
    customer = _customer(db_session)

    response = client.get(PING, headers=_headers(_token(customer.user_id, "client")))

    assert response.status_code == 403
    assert response.json()["detail"] == "Esta acción requiere una cuenta de vendedor."


def test_ping_without_token_returns_401(client):
    assert client.get(PING).status_code == 401


def test_ping_with_token_garbage_returns_401(client):
    assert client.get(PING, headers=_headers("esto.no.es.un.jwt")).status_code == 401


def test_ping_with_token_expired_returns_401(client, db_session):
    seller = _seller(db_session)

    response = client.get(PING, headers=_headers(_token(seller.user_id, "employee", minutes_count=-1)))

    assert response.status_code == 401
    assert response.json()["detail"] == "Token inválido o expirado."


def test_ping_with_seller_that_already_no_exists_returns_401(client):
    assert client.get(PING, headers=_headers(_token(9999, "employee"))).status_code == 401


def test_ping_with_token_of_seller_but_id_of_a_customer_returns_401(client, db_session):
    # El user_type del token dice vendedor pero el id es de un cliente: no
    # existe como empleado, no se le da acceso.
    customer = _customer(db_session)

    response = client.get(PING, headers=_headers(_token(customer.user_id, "employee")))

    assert response.status_code == 401


def test_the_token_of_the_login_of_seller_works_for_analytics(client, db_session):
    _seller(db_session)
    token = client.post(
        "/api/v1/auth/login", json={"email": "vendedor@example.com", "password": "secreto123"}
    ).json()["access_token"]

    assert client.get(PING, headers=_headers(token)).status_code == 200


def test_the_token_of_the_login_of_customer_no_works_for_analytics(client, db_session):
    _customer(db_session)
    token = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "secreto123"}
    ).json()["access_token"]

    assert client.get(PING, headers=_headers(token)).status_code == 403


def test_token_issued_with_create_access_token_for_employee_works(client, db_session):
    seller = _seller(db_session)
    token = create_access_token(subject=str(seller.user_id), extra_claims={"user_type": "employee"})

    assert client.get(PING, headers=_headers(token)).status_code == 200


# --- Stock y más vendidos del dashboard (HU 5.2 y 5.3) ---

STOCK = "/api/v1/analytics/stock"
MAS_VENDIDOS = "/api/v1/analytics/best-sellers"


def _seller_headers(db_session):
    seller = _seller(db_session)
    return _headers(_token(seller.user_id, "employee"))


def _part(db_session, code, stock, categoria="Frenos"):
    part = Part(
        part_code=code,
        name=f"Repuesto {code}",
        manufacturer="Bosch",
        category=categoria,
        price=1000,
        stock=stock,
    )
    db_session.add(part)
    db_session.commit()
    return part


def _order(db_session, customer, items, days_ago=1, state=OrderStatus.CONFIRMED):
    order = Order(
        client_id=customer.user_id,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        status=state,
        ship_personal_name=customer.name,
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Visa •••• 1234",
        items=[OrderItem(part=part, quantity=qty, frozen_price=part.price) for part, qty in items],
    )
    db_session.add(order)
    db_session.commit()
    return order


def test_stock_requires_seller(client, db_session):
    customer = _customer(db_session)

    assert client.get(STOCK).status_code == 401
    assert client.get(STOCK, headers=_headers(_token(customer.user_id, "client"))).status_code == 403


def test_stock_list_all_the_parts_of_less_a_more_stock(client, db_session):
    _part(db_session, "FRE-001", stock=20)
    _part(db_session, "FRE-002", stock=0)
    _part(db_session, "FRE-003", stock=5)

    body = client.get(STOCK, headers=_seller_headers(db_session)).json()

    assert body["low_stock_threshold"] == 5
    assert [(p["part_code"], p["stock"], p["low_stock"]) for p in body["parts"]] == [
        ("FRE-002", 0, True),
        ("FRE-003", 5, True),
        ("FRE-001", 20, False),
    ]
    assert body["parts"][0]["name"] == "Repuesto FRE-002"


def test_stock_with_another_threshold_of_stock_low(client, db_session):
    _part(db_session, "FRE-001", stock=8)

    body = client.get(STOCK, params={"low_stock_threshold": 10}, headers=_seller_headers(db_session)).json()

    assert body["low_stock_threshold"] == 10
    assert body["parts"][0]["low_stock"] is True


def test_stock_reflects_the_changes_of_stock(client, db_session):
    headers = _seller_headers(db_session)
    part = _part(db_session, "FRE-001", stock=20)
    assert client.get(STOCK, headers=headers).json()["parts"][0]["low_stock"] is False

    part.stock = 2
    db_session.commit()

    assert client.get(STOCK, headers=headers).json()["parts"][0]["stock"] == 2
    assert client.get(STOCK, headers=headers).json()["parts"][0]["low_stock"] is True


def test_stock_rejects_a_threshold_negative(client, db_session):
    response = client.get(STOCK, params={"low_stock_threshold": -1}, headers=_seller_headers(db_session))

    assert response.status_code == 422


def test_more_sold_requires_seller(client, db_session):
    customer = _customer(db_session)

    assert client.get(MAS_VENDIDOS).status_code == 401
    assert client.get(MAS_VENDIDOS, headers=_headers(_token(customer.user_id, "client"))).status_code == 403


def test_more_sold_sorts_by_units_sold(client, db_session):
    headers = _seller_headers(db_session)
    customer = _customer(db_session)
    brake_pads = _part(db_session, "FRE-001", stock=10)
    discos = _part(db_session, "FRE-002", stock=10)
    _part(db_session, "FRE-003", stock=10)  # nunca se vendió
    _order(db_session, customer, [(brake_pads, 2), (discos, 3)])
    _order(db_session, customer, [(discos, 4)])

    body = client.get(MAS_VENDIDOS, headers=headers).json()

    assert body["days"] is None
    assert [(p["part_code"], p["units_sold"]) for p in body["parts"]] == [("FRE-002", 7), ("FRE-001", 2)]


def test_more_sold_includes_the_sold_out_and_no_account_cancelled(client, db_session):
    headers = _seller_headers(db_session)
    customer = _customer(db_session)
    sold_out = _part(db_session, "FRE-001", stock=0)
    other = _part(db_session, "FRE-002", stock=10)
    _order(db_session, customer, [(sold_out, 3)])
    _order(db_session, customer, [(other, 50)], state=OrderStatus.CANCELLED)

    body = client.get(MAS_VENDIDOS, headers=headers).json()

    assert [(p["part_code"], p["stock"], p["units_sold"]) for p in body["parts"]] == [("FRE-001", 0, 3)]


def test_more_sold_by_period_and_with_limit(client, db_session):
    headers = _seller_headers(db_session)
    customer = _customer(db_session)
    old = _part(db_session, "FRE-001", stock=10)
    reciente = _part(db_session, "FRE-002", stock=10)
    tercero = _part(db_session, "FRE-003", stock=10)
    _order(db_session, customer, [(old, 100)], days_ago=200)
    _order(db_session, customer, [(reciente, 5), (tercero, 1)], days_ago=3)

    last_month = client.get(MAS_VENDIDOS, params={"days": 30}, headers=headers).json()
    top_1 = client.get(MAS_VENDIDOS, params={"limit": 1}, headers=headers).json()

    assert last_month["days"] == 30
    assert [p["part_code"] for p in last_month["parts"]] == ["FRE-002", "FRE-003"]
    assert [p["part_code"] for p in top_1["parts"]] == ["FRE-001"]
