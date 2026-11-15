"""Tests de los avisos de vuelta de stock."""

from app.core.security import create_access_token
from app.models.client import Client
from app.models.part import Part
from app.models.stock_alert import StockAlert

ALERTS = "/api/v1/stock-alerts"


def make_client(db_session, username="ana", email="ana@example.com"):
    customer = Client(username=username, password="secret", name="Ana", email=email)
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    return customer


def make_part(db_session, stock=0, part_code="FAR-001"):
    part = Part(part_code=part_code, name="Faro delantero", manufacturer="Bosch", category="Carrocería", price=8900, stock=stock)
    db_session.add(part)
    db_session.commit()
    db_session.refresh(part)
    return part


def auth_headers(user):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": "client"})
    return {"Authorization": f"Bearer {token}"}


def test_subscribe_a_part_sold_out(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)

    assert client.get(ALERTS, headers=headers).json() == {"part_ids": []}
    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 204
    assert client.get(ALERTS, headers=headers).json() == {"part_ids": [part.id]}


def test_subscribe_two_times_leaves_a_single(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)

    client.put(f"{ALERTS}/{part.id}", headers=headers)
    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 204
    assert db_session.query(StockAlert).count() == 1


def test_with_stock_no_does_missing_notice(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session, stock=3)

    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 409
    assert "ya lo podés comprar" in response.json()["detail"]
    assert db_session.query(StockAlert).count() == 0


def test_part_nonexistent(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert client.put(f"{ALERTS}/9999", headers=headers).status_code == 404


def test_cancel_the_subscription(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)
    client.put(f"{ALERTS}/{part.id}", headers=headers)

    response = client.delete(f"{ALERTS}/{part.id}", headers=headers)
    without_subscription = client.delete(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == without_subscription.status_code == 204
    assert client.get(ALERTS, headers=headers).json() == {"part_ids": []}


def test_each_customer_sees_only_its_subscriptions(client, db_session):
    ana = make_client(db_session)
    beto = make_client(db_session, username="beto", email="beto@example.com")
    part = make_part(db_session)
    client.put(f"{ALERTS}/{part.id}", headers=auth_headers(ana))

    assert client.get(ALERTS, headers=auth_headers(beto)).json() == {"part_ids": []}


def test_requires_session(client, db_session):
    part = make_part(db_session)

    assert client.get(ALERTS).status_code == 401
    assert client.put(f"{ALERTS}/{part.id}").status_code == 401
    assert client.delete(f"{ALERTS}/{part.id}").status_code == 401
