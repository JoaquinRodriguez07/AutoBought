from sqlalchemy import select

import pytest

from app.core.phone import normalize_uy_phone
from app.core.security import create_access_token, verify_password
from app.models.client import Client
from app.models.user import User

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"


def payload(**overrides):
    data = {
        "name": "Lucía Gómez",
        "email": "lucia@example.com",
        "phone": "099 123 456",
        "password": "secreto123",
    }
    data.update(overrides)
    return data


def test_registro_exitoso_crea_cliente_con_password_cifrada(client, db_session):
    response = client.post(REGISTER, json=payload())

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    cliente = db_session.scalars(select(Client)).one()
    assert cliente.email == "lucia@example.com"
    assert cliente.name == "Lucía Gómez"
    assert cliente.phone == "+59899123456"  # normalizado
    assert cliente.user_type == "client"
    assert cliente.password != "secreto123"
    assert cliente.password.startswith("$2")  # bcrypt
    assert verify_password("secreto123", cliente.password)


def test_se_puede_iniciar_sesion_despues_de_registrarse(client):
    client.post(REGISTER, json=payload())

    response = client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"})

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_no_distingue_mayusculas_en_el_correo(client):
    client.post(REGISTER, json=payload(email="Lucia@Example.com"))

    response = client.post(LOGIN, json={"email": "LUCIA@example.com", "password": "secreto123"})

    assert response.status_code == 200


def test_el_token_del_registro_sirve_para_endpoints_de_cliente(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.get("/api/v1/cart", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200


def test_correo_ya_registrado_devuelve_409_y_no_crea_usuario(client, db_session):
    client.post(REGISTER, json=payload(email="test@autobought.com"))

    response = client.post(REGISTER, json=payload(name="Otro", email="test@autobought.com"))

    assert response.status_code == 409
    assert response.json()["detail"] == "El correo ya está en uso."
    assert len(db_session.scalars(select(User)).all()) == 1


def test_correo_duplicado_con_distinta_capitalizacion_tambien_es_409(client, db_session):
    client.post(REGISTER, json=payload(email="test@autobought.com"))

    response = client.post(REGISTER, json=payload(email="TEST@autobought.com"))

    assert response.status_code == 409
    assert len(db_session.scalars(select(User)).all()) == 1


def test_correo_mal_formado_devuelve_422(client, db_session):
    response = client.post(REGISTER, json=payload(email="no-es-un-correo"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_password_corta_devuelve_422(client, db_session):
    response = client.post(REGISTER, json=payload(password="1234567"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_password_de_exactamente_8_caracteres_es_valida(client):
    assert client.post(REGISTER, json=payload(password="12345678")).status_code == 201


def test_password_de_mas_de_72_bytes_devuelve_422_y_no_500(client):
    response = client.post(REGISTER, json=payload(password="a" * 73))

    assert response.status_code == 422


def test_nombre_vacio_devuelve_422(client):
    assert client.post(REGISTER, json=payload(name="   ")).status_code == 422


def test_usernames_no_colisionan_con_correos_de_igual_parte_local(client, db_session):
    client.post(REGISTER, json=payload(email="ana@uno.com"))
    response = client.post(REGISTER, json=payload(email="ana@dos.com"))

    assert response.status_code == 201
    usernames = {u.username for u in db_session.scalars(select(User)).all()}
    assert len(usernames) == 2


def test_telefono_es_opcional_y_vacio_se_guarda_como_null(client, db_session):
    assert client.post(REGISTER, json=payload(phone="   ")).status_code == 201

    assert db_session.scalars(select(Client)).one().phone is None


def test_telefono_demasiado_largo_devuelve_422(client):
    assert client.post(REGISTER, json=payload(phone="1" * 31)).status_code == 422


@pytest.mark.parametrize(
    "raw, esperado",
    [
        ("099 123 456", "+59899123456"),
        ("099123456", "+59899123456"),
        ("091-234-567", "+59891234567"),
        ("+598 99 123 456", "+59899123456"),
        ("+598 099 123 456", "+59899123456"),
        ("00598 99123456", "+59899123456"),
        ("59899123456", "+59899123456"),
        ("2900 1234", "+59829001234"),  # fijo Montevideo
        ("4332 1234", "+59843321234"),  # fijo interior
        ("(02) 900 1234", "+59829001234"),
    ],
)
def test_telefonos_uruguayos_validos_se_normalizan(raw, esperado):
    assert normalize_uy_phone(raw) == esperado


@pytest.mark.parametrize(
    "raw",
    [
        "12345",  # muy corto
        "099 12 34",  # incompleto
        "090 123 456",  # operadora inexistente (90)
        "099 123 4567",  # un dígito de más
        "3123 4567",  # fijo con prefijo inexistente
        "+54 9 11 1234 5678",  # Argentina
        "+1 415 555 2671",  # EE.UU.
        "abc 123 456",
        "099-123-45a",
    ],
)
def test_telefonos_no_uruguayos_se_rechazan(raw):
    with pytest.raises(ValueError):
        normalize_uy_phone(raw)


def test_registro_con_telefono_invalido_devuelve_422_y_no_crea_usuario(client, db_session):
    response = client.post(REGISTER, json=payload(phone="+54 9 11 1234 5678"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_me_devuelve_el_perfil_con_el_telefono_guardado(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "user_id": response.json()["user_id"],
        "name": "Lucía Gómez",
        "email": "lucia@example.com",
        "phone": "+59899123456",
    }
    assert "password" not in response.json()


def test_me_devuelve_phone_null_si_el_cliente_no_tiene_telefono(client):
    token = client.post(REGISTER, json=payload(phone=None)).json()["access_token"]

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["phone"] is None


def test_me_sin_token_devuelve_401(client):
    assert client.get(ME).status_code == 401


def test_me_con_token_de_empleado_devuelve_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403
