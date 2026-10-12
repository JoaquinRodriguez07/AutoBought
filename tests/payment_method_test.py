from app.core.security import create_access_token
from app.models.client import Client


def make_client(db_session, username="ana", email="ana@example.com"):
    cliente = Client(username=username, password="secret", name="Ana", email=email)
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)
    return cliente


def auth_headers(user):
    token = create_access_token(
        subject=str(user.user_id), extra_claims={"user_type": "client"}
    )
    return {"Authorization": f"Bearer {token}"}


def payload(**overrides):
    data = {
        "card_type": "Visa",
        "holder": "Ana Perez",
        "last_four": "4242",
        "expiry": "12/30",
    }
    data.update(overrides)
    return data


def create(client, headers, **overrides):
    return client.post("/api/v1/payment-methods", json=payload(**overrides), headers=headers)


def primaries(client, headers):
    resp = client.get("/api/v1/payment-methods", headers=headers)
    return [m["payment_method_id"] for m in resp.json() if m["is_primary"]]


def test_requires_authentication(client):
    assert client.get("/api/v1/payment-methods").status_code == 401
    assert client.post("/api/v1/payment-methods", json=payload()).status_code == 401


def test_create_and_list_payment_method(client, db_session):
    headers = auth_headers(make_client(db_session))

    resp = create(client, headers)
    assert resp.status_code == 201
    assert resp.json()["last_four"] == "4242"

    listed = client.get("/api/v1/payment-methods", headers=headers).json()
    assert [m["holder"] for m in listed] == ["Ana Perez"]


def test_full_card_number_and_cvv_are_rejected(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert create(client, headers, card_number="4242424242424242").status_code == 422
    assert create(client, headers, cvv="123").status_code == 422
    assert create(client, headers, last_four="4242424242424242").status_code == 422
    assert client.get("/api/v1/payment-methods", headers=headers).json() == []


def test_invalid_data_is_rejected(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert create(client, headers, card_type="Diners").status_code == 422
    assert create(client, headers, expiry="13/30").status_code == 422
    assert create(client, headers, expiry="1230").status_code == 422
    assert create(client, headers, last_four="42a2").status_code == 422


def test_first_method_is_primary_automatically(client, db_session):
    headers = auth_headers(make_client(db_session))

    first = create(client, headers).json()
    second = create(client, headers, card_type="Mastercard").json()

    assert first["is_primary"] is True
    assert second["is_primary"] is False


def test_creating_primary_method_unsets_previous_one(client, db_session):
    headers = auth_headers(make_client(db_session))
    create(client, headers)
    new = create(client, headers, card_type="Mastercard", is_primary=True).json()

    assert primaries(client, headers) == [new["payment_method_id"]]


def test_set_primary_keeps_only_one_primary(client, db_session):
    headers = auth_headers(make_client(db_session))
    create(client, headers)
    second = create(client, headers, card_type="Mastercard").json()

    resp = client.patch(
        f"/api/v1/payment-methods/{second['payment_method_id']}/primary", headers=headers
    )

    assert resp.status_code == 200
    assert primaries(client, headers) == [second["payment_method_id"]]


def test_deleting_primary_promotes_oldest_remaining(client, db_session):
    headers = auth_headers(make_client(db_session))
    first = create(client, headers).json()
    create(client, headers, card_type="Mastercard")
    third = create(client, headers, card_type="American Express", is_primary=True).json()

    resp = client.delete(
        f"/api/v1/payment-methods/{third['payment_method_id']}", headers=headers
    )

    assert resp.status_code == 204
    assert primaries(client, headers) == [first["payment_method_id"]]


def test_client_does_not_see_other_clients_methods(client, db_session):
    ana = auth_headers(make_client(db_session))
    beto = auth_headers(make_client(db_session, username="beto", email="beto@example.com"))
    create(client, ana)

    assert client.get("/api/v1/payment-methods", headers=beto).json() == []


def test_client_cannot_modify_other_clients_method(client, db_session):
    ana = auth_headers(make_client(db_session))
    beto = auth_headers(make_client(db_session, username="beto", email="beto@example.com"))
    method_id = create(client, ana).json()["payment_method_id"]

    assert client.patch(f"/api/v1/payment-methods/{method_id}/primary", headers=beto).status_code == 404
    assert client.delete(f"/api/v1/payment-methods/{method_id}", headers=beto).status_code == 404
    assert len(client.get("/api/v1/payment-methods", headers=ana).json()) == 1
