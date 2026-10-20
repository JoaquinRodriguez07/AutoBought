from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

import pytest

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.phone import normalize_uy_phone
from app.core.security import create_access_token, verify_password
from app.models.client import Client
from app.models.user import User

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
REFRESH = "/api/v1/auth/refresh"


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
    assert client.post(REGISTER, json=payload(password="clave123")).status_code == 201


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


@pytest.mark.parametrize("phone", ["   ", None])
def test_telefono_es_obligatorio_en_el_registro(client, db_session, phone):
    assert client.post(REGISTER, json=payload(phone=phone)).status_code == 422
    assert db_session.scalars(select(Client)).all() == []


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


def test_me_devuelve_phone_null_si_el_cliente_no_tiene_telefono(client, db_session):
    # Clientes registrados antes de que el teléfono fuera obligatorio.
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    db_session.scalars(select(Client)).one().phone = None
    db_session.commit()

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["phone"] is None


def test_me_sin_token_devuelve_401(client):
    assert client.get(ME).status_code == 401


def test_me_con_token_de_empleado_devuelve_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


def _headers(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_patch_me_actualiza_nombre_y_telefono(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez", "phone": "098 765 432"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["name"] == "Lucía Pérez"
    assert response.json()["phone"] == "+59898765432"
    # Persistido: otro GET (ej. desde otro dispositivo) ve lo nuevo.
    assert client.get(ME, headers=headers).json()["name"] == "Lucía Pérez"


@pytest.mark.parametrize("phone", ["", "   ", None])
def test_patch_me_no_permite_borrar_el_telefono(client, phone):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Gómez", "phone": phone}, headers=headers)

    assert response.status_code == 422
    assert client.get(ME, headers=headers).json()["phone"] == "+59899123456"


def test_patch_me_sin_telefono_mantiene_el_que_estaba(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["phone"] == "+59899123456"


def test_patch_me_telefono_invalido_devuelve_422(client):
    response = client.patch(ME, json={"name": "Lucía", "phone": "123"}, headers=_headers(client))

    assert response.status_code == 422


def test_patch_me_nombre_vacio_devuelve_422(client):
    assert client.patch(ME, json={"name": "   "}, headers=_headers(client)).status_code == 422


def test_patch_me_no_permite_cambiar_el_correo(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía", "email": "otro@example.com"}, headers=headers)

    assert response.status_code == 422
    assert client.get(ME, headers=headers).json()["email"] == "lucia@example.com"


def test_patch_me_sin_token_devuelve_401(client):
    assert client.patch(ME, json={"name": "Lucía"}).status_code == 401


def test_patch_me_con_token_de_empleado_devuelve_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.patch(ME, json={"name": "Lucía"}, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


PASSWORD = "/api/v1/auth/me/password"


def test_cambiar_password_permite_login_con_la_nueva_y_no_con_la_vieja(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "nueva-clave-1"},
        headers=_headers(client),
    )

    assert response.status_code == 204
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "nueva-clave-1"}).status_code == 200
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 401


def test_cambiar_password_guarda_la_nueva_cifrada(client, db_session):
    client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "nueva-clave-1"},
        headers=_headers(client),
    )

    user = db_session.scalars(select(User).where(User.email == "lucia@example.com")).one()
    assert user.password != "nueva-clave-1"
    assert verify_password("nueva-clave-1", user.password)


def test_cambiar_password_con_la_actual_incorrecta_devuelve_400(client):
    headers = _headers(client)

    response = client.patch(
        PASSWORD,
        json={"current_password": "otra-cosa", "new_password": "nueva-clave-1"},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "La contraseña actual es incorrecta."
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 200


def test_cambiar_password_por_la_misma_devuelve_400(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "secreto123"},
        headers=_headers(client),
    )

    assert response.status_code == 400


def test_cambiar_password_nueva_corta_devuelve_422(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "corta"},
        headers=_headers(client),
    )

    assert response.status_code == 422


def test_cambiar_password_de_mas_de_72_bytes_devuelve_422_y_no_500(client):
    headers = _headers(client)

    nueva_larga = client.patch(
        PASSWORD, json={"current_password": "secreto123", "new_password": "ñ" * 40}, headers=headers
    )
    actual_larga = client.patch(
        PASSWORD, json={"current_password": "ñ" * 40, "new_password": "nueva-clave-1"}, headers=headers
    )

    assert nueva_larga.status_code == 422
    assert actual_larga.status_code == 422


def test_cambiar_password_sin_token_devuelve_401(client):
    response = client.patch(PASSWORD, json={"current_password": "secreto123", "new_password": "nueva-clave-1"})

    assert response.status_code == 401


def test_patch_me_sin_phone_conserva_el_telefono(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["phone"] == "+59899123456"


# --- Renovación de token (POST /auth/refresh) ---


def _token(subject, minutos, user_type="client"):
    """Token firmado como el real pero con la vigencia que se pida
    (negativa = ya vencido)."""
    payload = {
        "sub": str(subject),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutos),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _claims(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])


def _registrar_y_obtener_id(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    return _claims(token)["sub"]


def test_refresh_con_token_valido_devuelve_un_token_nuevo_con_vigencia_completa(client):
    user_id = _registrar_y_obtener_id(client)
    # Token a punto de vencer (2 minutos): el nuevo tiene que traer la hora
    # completa, no heredar la del viejo.
    viejo = _token(user_id, minutos=2)

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {viejo}"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    nuevo = _claims(body["access_token"])
    assert nuevo["sub"] == user_id
    assert nuevo["user_type"] == "client"
    assert nuevo["exp"] > _claims(viejo)["exp"]
    restante = nuevo["exp"] - datetime.now(timezone.utc).timestamp()
    assert 59 * 60 < restante <= 60 * 60


def test_el_token_renovado_sirve_para_endpoints_de_cliente(client):
    user_id = _registrar_y_obtener_id(client)

    nuevo = client.post(
        REFRESH, headers={"Authorization": f"Bearer {_token(user_id, minutos=1)}"}
    ).json()["access_token"]

    response = client.get(ME, headers={"Authorization": f"Bearer {nuevo}"})
    assert response.status_code == 200
    assert response.json()["email"] == "lucia@example.com"


def test_se_puede_renovar_varias_veces_seguidas(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    for _ in range(3):
        response = client.post(REFRESH, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        token = response.json()["access_token"]

    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_refresh_con_token_vencido_devuelve_401(client):
    user_id = _registrar_y_obtener_id(client)
    vencido = _token(user_id, minutos=-1)

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {vencido}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Token inválido o expirado."
    assert "access_token" not in response.json()


def test_refresh_sin_token_devuelve_401(client):
    assert client.post(REFRESH).status_code == 401


def test_refresh_con_token_basura_devuelve_401(client):
    response = client.post(REFRESH, headers={"Authorization": "Bearer esto.no.es.un.jwt"})

    assert response.status_code == 401


def test_refresh_con_token_firmado_con_otra_clave_devuelve_401(client):
    user_id = _registrar_y_obtener_id(client)
    falso = jwt.encode(
        {"sub": user_id, "user_type": "client", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "otra-clave-que-no-es-la-del-servidor-123456",
        algorithm=JWT_ALGORITHM,
    )

    assert client.post(REFRESH, headers={"Authorization": f"Bearer {falso}"}).status_code == 401


def test_refresh_de_un_cliente_que_ya_no_existe_devuelve_401(client):
    # Token válido y firmado, pero el usuario fue borrado de la base.
    response = client.post(REFRESH, headers={"Authorization": f"Bearer {_token(9999, minutos=5)}"})

    assert response.status_code == 401


def test_refresh_con_token_de_empleado_devuelve_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


# =====================================================
# Validaciones de nombre y contraseña
# =====================================================


@pytest.mark.parametrize("name", ["123", "Lucía @@", "L"])
def test_nombre_invalido_en_el_registro_devuelve_422(client, db_session, name):
    response = client.post(REGISTER, json=payload(name=name))

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert db_session.scalars(select(User)).all() == []


@pytest.mark.parametrize("password", ["abcdefgh", "12345678", "Password1", "lucia2026"])
def test_password_debil_en_el_registro_devuelve_422(client, db_session, password):
    response = client.post(REGISTER, json=payload(password=password))

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "password"]


def test_nombre_invalido_al_editar_el_perfil_devuelve_422(client):
    response = client.patch(ME, json={"name": "Lucía 123"}, headers=_headers(client))

    assert response.status_code == 422


@pytest.mark.parametrize("nueva", ["solotexto", "qwerty123", "lucia-2026"])
def test_cambiar_password_por_una_debil_devuelve_422(client, nueva):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": nueva},
        headers=_headers(client),
    )

    assert response.status_code == 422
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 200
