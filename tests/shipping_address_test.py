import itertools

import pytest

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
        "personal_name": "Casa",
        "street": "Goes",
        "number": "2297",
        "city": "Montevideo",
        "department": "Montevideo",
    }
    data.update(overrides)
    return data


_numeros = itertools.count(1000)


def create(client, headers, **overrides):
    # Cada dirección en otro número de puerta: dos iguales son un duplicado.
    overrides.setdefault("number", str(next(_numeros)))
    return client.post("/api/v1/addresses", json=payload(**overrides), headers=headers)


def primaries(client, headers):
    resp = client.get("/api/v1/addresses", headers=headers)
    return [a["shipping_address_id"] for a in resp.json() if a["is_primary"]]


def test_requires_authentication(client):
    assert client.get("/api/v1/addresses").status_code == 401
    assert client.post("/api/v1/addresses", json=payload()).status_code == 401


def test_create_and_list_address(client, db_session):
    headers = auth_headers(make_client(db_session))

    resp = create(client, headers, apartment="114", postal_code="11800")
    assert resp.status_code == 201
    assert resp.json()["department"] == "Montevideo"

    listed = client.get("/api/v1/addresses", headers=headers).json()
    assert [a["street"] for a in listed] == ["Goes"]


def test_invalid_department_is_rejected(client, db_session):
    headers = auth_headers(make_client(db_session))
    assert create(client, headers, department="Atlantida").status_code == 422


def test_first_address_is_primary_automatically(client, db_session):
    headers = auth_headers(make_client(db_session))

    first = create(client, headers).json()
    second = create(client, headers, personal_name="Trabajo").json()

    assert first["is_primary"] is True
    assert second["is_primary"] is False


def test_creating_primary_address_unsets_previous_one(client, db_session):
    headers = auth_headers(make_client(db_session))
    create(client, headers)
    new = create(client, headers, personal_name="Trabajo", is_primary=True).json()

    assert primaries(client, headers) == [new["shipping_address_id"]]


def test_set_primary_keeps_only_one_primary(client, db_session):
    headers = auth_headers(make_client(db_session))
    create(client, headers)
    second = create(client, headers, personal_name="Trabajo").json()

    resp = client.patch(
        f"/api/v1/addresses/{second['shipping_address_id']}/primary", headers=headers
    )

    assert resp.status_code == 200
    assert primaries(client, headers) == [second["shipping_address_id"]]


def test_deleting_primary_promotes_oldest_remaining(client, db_session):
    headers = auth_headers(make_client(db_session))
    first = create(client, headers).json()
    second = create(client, headers, personal_name="Trabajo").json()
    third = create(client, headers, personal_name="Padres", is_primary=True).json()

    resp = client.delete(
        f"/api/v1/addresses/{third['shipping_address_id']}", headers=headers
    )

    assert resp.status_code == 204
    assert primaries(client, headers) == [first["shipping_address_id"]]
    assert second["shipping_address_id"] not in primaries(client, headers)


def test_client_does_not_see_other_clients_addresses(client, db_session):
    ana = auth_headers(make_client(db_session))
    beto = auth_headers(make_client(db_session, username="beto", email="beto@example.com"))
    create(client, ana)

    assert client.get("/api/v1/addresses", headers=beto).json() == []


def test_client_cannot_modify_other_clients_address(client, db_session):
    ana = auth_headers(make_client(db_session))
    beto = auth_headers(make_client(db_session, username="beto", email="beto@example.com"))
    address_id = create(client, ana).json()["shipping_address_id"]

    assert client.patch(f"/api/v1/addresses/{address_id}/primary", headers=beto).status_code == 404
    assert client.delete(f"/api/v1/addresses/{address_id}", headers=beto).status_code == 404
    assert len(client.get("/api/v1/addresses", headers=ana).json()) == 1


# =====================================================
# Validaciones
# =====================================================


@pytest.mark.parametrize(
    "campo, valor",
    [
        ("personal_name", "   "),
        ("personal_name", "123"),
        ("street", "   "),
        ("street", "@@@"),
        ("number", "abc"),
        ("apartment", "#!"),
        ("city", "   "),
        ("postal_code", "1130"),
        ("postal_code", "ABCDE"),
    ],
)
def test_datos_invalidos_se_rechazan_en_su_campo(client, db_session, campo, valor):
    headers = auth_headers(make_client(db_session))

    resp = create(client, headers, **{campo: valor})

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", campo]


def test_ciudad_de_otro_departamento_se_rechaza(client, db_session):
    headers = auth_headers(make_client(db_session))

    resp = create(client, headers, city="Montevideo", department="Artigas")

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "department"]
    assert "Montevideo no está en el departamento de Artigas" in resp.json()["detail"][0]["msg"]


def test_sin_numero_y_espacios_se_normalizan(client, db_session):
    headers = auth_headers(make_client(db_session))

    body = create(client, headers, street="  Ruta   8 ", number="s/n", city="Pando",
                  department="Canelones", apartment="  ", postal_code="").json()

    assert (body["street"], body["number"], body["apartment"], body["postal_code"]) == (
        "Ruta 8", "S/N", None, None,
    )


def test_direccion_duplicada_devuelve_409_sin_importar_mayusculas_ni_tildes(client, db_session):
    headers = auth_headers(make_client(db_session))
    create(client, headers, street="Av. Italia", number="1234")

    resp = create(client, headers, personal_name="Otra", street="AV. ITALIA", number="1234")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Ya tenés guardada esta dirección."


def test_no_se_pueden_guardar_mas_de_10_direcciones(client, db_session):
    headers = auth_headers(make_client(db_session))
    for _ in range(10):
        assert create(client, headers).status_code == 201

    assert create(client, headers).status_code == 409
