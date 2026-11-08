"""Tests del registro, el login, la sesión y el perfil."""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

import pytest

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.phone import normalize_uy_phone
from app.core.security import (
    RESET_PASSWORD,
    create_access_token,
    create_purpose_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.crud import user as crud_user
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


def test_signup_successful_creates_customer_with_password_hashed(client, db_session):
    response = client.post(REGISTER, json=payload())

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    customer = db_session.scalars(select(Client)).one()
    assert customer.email == "lucia@example.com"
    assert customer.name == "Lucía Gómez"
    assert customer.phone == "+59899123456"  # normalizado
    assert customer.user_type == "client"
    assert customer.password != "secreto123"
    assert customer.password.startswith("$2")  # bcrypt
    assert verify_password("secreto123", customer.password)


def test_can_start_session_after_of_signing_up(client):
    client.post(REGISTER, json=payload())

    response = client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"})

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_the_token_of_session_brings_the_name_of_the_user(client):
    client.post(REGISTER, json=payload())
    response = client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"})

    claims = jwt.decode(response.json()["access_token"], SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert claims["name"] == "Lucía Gómez"


def test_login_no_distinguishes_uppercase_in_the_email(client):
    client.post(REGISTER, json=payload(email="Lucia@Example.com"))

    response = client.post(LOGIN, json={"email": "LUCIA@example.com", "password": "secreto123"})

    assert response.status_code == 200


def test_the_token_of_the_signup_works_for_endpoints_of_customer(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.get("/api/v1/cart", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200


def test_email_already_registered_returns_409_and_no_creates_user(client, db_session):
    client.post(REGISTER, json=payload(email="test@autobought.com"))

    response = client.post(REGISTER, json=payload(name="Otro", email="test@autobought.com"))

    assert response.status_code == 409
    assert response.json()["detail"] == "El correo ya está en uso."
    assert len(db_session.scalars(select(User)).all()) == 1


def test_email_duplicate_with_different_capitalization_also_is_409(client, db_session):
    client.post(REGISTER, json=payload(email="test@autobought.com"))

    response = client.post(REGISTER, json=payload(email="TEST@autobought.com"))

    assert response.status_code == 409
    assert len(db_session.scalars(select(User)).all()) == 1


def test_email_badly_formed_returns_422(client, db_session):
    response = client.post(REGISTER, json=payload(email="no-es-un-correo"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_password_stops_returns_422(client, db_session):
    response = client.post(REGISTER, json=payload(password="1234567"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_password_of_exactly_8_characters_is_validates(client):
    assert client.post(REGISTER, json=payload(password="clave123")).status_code == 201


def test_password_of_more_of_72_bytes_returns_422_and_no_500(client):
    response = client.post(REGISTER, json=payload(password="a" * 73))

    assert response.status_code == 422


def test_name_empty_returns_422(client):
    assert client.post(REGISTER, json=payload(name="   ")).status_code == 422


def test_usernames_no_collide_with_emails_of_same_part_local(client, db_session):
    client.post(REGISTER, json=payload(email="ana@uno.com"))
    response = client.post(REGISTER, json=payload(email="ana@dos.com"))

    assert response.status_code == 201
    usernames = {u.username for u in db_session.scalars(select(User)).all()}
    assert len(usernames) == 2


@pytest.mark.parametrize("phone", ["   ", None])
def test_phone_is_required_in_the_signup(client, db_session, phone):
    assert client.post(REGISTER, json=payload(phone=phone)).status_code == 422
    assert db_session.scalars(select(Client)).all() == []


def test_phone_too_long_returns_422(client):
    assert client.post(REGISTER, json=payload(phone="1" * 31)).status_code == 422


@pytest.mark.parametrize(
    "raw, expected_value",
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
def test_phones_uruguayan_valid_are_normalized(raw, expected_value):
    assert normalize_uy_phone(raw) == expected_value


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
def test_phones_no_uruguayan_reject(raw):
    with pytest.raises(ValueError):
        normalize_uy_phone(raw)


def test_signup_with_phone_invalid_returns_422_and_no_creates_user(client, db_session):
    response = client.post(REGISTER, json=payload(phone="+54 9 11 1234 5678"))

    assert response.status_code == 422
    assert db_session.scalars(select(User)).all() == []


def test_me_returns_the_profile_with_the_phone_saved(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "user_id": response.json()["user_id"],
        "name": "Lucía Gómez",
        "email": "lucia@example.com",
        "phone": "+59899123456",
        "email_verified": False,
        "marketing_emails": True,
    }
    assert "password" not in response.json()


def test_me_returns_phone_null_if_the_customer_no_has_phone(client, db_session):
    # Clientes registrados antes de que el teléfono fuera obligatorio.
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    db_session.scalars(select(Client)).one().phone = None
    db_session.commit()

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["phone"] is None


def test_me_without_token_returns_401(client):
    assert client.get(ME).status_code == 401


def test_me_with_token_of_employee_returns_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


def _headers(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_patch_me_updates_name_and_phone(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez", "phone": "098 765 432"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["name"] == "Lucía Pérez"
    assert response.json()["phone"] == "+59898765432"
    # Persistido: otro GET (ej. desde otro dispositivo) ve lo nuevo.
    assert client.get(ME, headers=headers).json()["name"] == "Lucía Pérez"


@pytest.mark.parametrize("phone", ["", "   ", None])
def test_patch_me_no_allows_clear_the_phone(client, phone):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Gómez", "phone": phone}, headers=headers)

    assert response.status_code == 422
    assert client.get(ME, headers=headers).json()["phone"] == "+59899123456"


def test_patch_me_without_phone_keeps_the_that_was(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["phone"] == "+59899123456"


def test_patch_me_phone_invalid_returns_422(client):
    response = client.patch(ME, json={"name": "Lucía", "phone": "123"}, headers=_headers(client))

    assert response.status_code == 422


def test_patch_me_name_empty_returns_422(client):
    assert client.patch(ME, json={"name": "   "}, headers=_headers(client)).status_code == 422


def test_patch_me_no_allows_change_the_email(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía", "email": "otro@example.com"}, headers=headers)

    assert response.status_code == 422
    assert client.get(ME, headers=headers).json()["email"] == "lucia@example.com"


def test_patch_me_without_token_returns_401(client):
    assert client.patch(ME, json={"name": "Lucía"}).status_code == 401


def test_patch_me_with_token_of_employee_returns_403(client):
    token = create_access_token(subject="1", extra_claims={"user_type": "employee"})

    response = client.patch(ME, json={"name": "Lucía"}, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


PASSWORD = "/api/v1/auth/me/password"


def test_change_password_allows_login_with_the_new_and_no_with_the_old(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "nueva-clave-1"},
        headers=_headers(client),
    )

    assert response.status_code == 200
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "nueva-clave-1"}).status_code == 200
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 401


def test_change_password_saves_the_new_hashed(client, db_session):
    client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "nueva-clave-1"},
        headers=_headers(client),
    )

    user = db_session.scalars(select(User).where(User.email == "lucia@example.com")).one()
    assert user.password != "nueva-clave-1"
    assert verify_password("nueva-clave-1", user.password)


def test_change_password_with_the_current_wrong_returns_400(client):
    headers = _headers(client)

    response = client.patch(
        PASSWORD,
        json={"current_password": "otra-cosa", "new_password": "nueva-clave-1"},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "La contraseña actual es incorrecta."
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 200


def test_change_password_by_the_same_returns_400(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "secreto123"},
        headers=_headers(client),
    )

    assert response.status_code == 400


def test_change_password_new_stops_returns_422(client):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "corta"},
        headers=_headers(client),
    )

    assert response.status_code == 422


def test_change_password_of_more_of_72_bytes_returns_422_and_no_500(client):
    headers = _headers(client)

    new_long = client.patch(
        PASSWORD, json={"current_password": "secreto123", "new_password": "ñ" * 40}, headers=headers
    )
    current_long = client.patch(
        PASSWORD, json={"current_password": "ñ" * 40, "new_password": "nueva-clave-1"}, headers=headers
    )

    assert new_long.status_code == 422
    assert current_long.status_code == 422


def test_change_password_without_token_returns_401(client):
    response = client.patch(PASSWORD, json={"current_password": "secreto123", "new_password": "nueva-clave-1"})

    assert response.status_code == 401


def test_patch_me_without_phone_keeps_the_phone(client):
    headers = _headers(client)

    response = client.patch(ME, json={"name": "Lucía Pérez"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["phone"] == "+59899123456"


# --- Renovación de token (POST /auth/refresh) ---


def _token(subject, minutes_count, user_type="client"):
    """Token firmado como el real pero con la vigencia que se pida
    (negativa = ya vencido)."""
    payload = {
        "sub": str(subject),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes_count),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _claims(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])


def _registrar_y_obtener_id(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    return _claims(token)["sub"]


def test_refresh_with_token_valid_returns_a_token_new_with_validity_full(client):
    user_id = _registrar_y_obtener_id(client)
    # Token a punto de vencer (2 minutos): el nuevo tiene que traer la hora
    # completa, no heredar la del viejo.
    old = _token(user_id, minutes_count=2)

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {old}"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    new_item = _claims(body["access_token"])
    assert new_item["sub"] == user_id
    assert new_item["user_type"] == "client"
    assert new_item["exp"] > _claims(old)["exp"]
    restante = new_item["exp"] - datetime.now(timezone.utc).timestamp()
    assert 59 * 60 < restante <= 60 * 60


def test_the_token_renewed_works_for_endpoints_of_customer(client):
    user_id = _registrar_y_obtener_id(client)

    new_item = client.post(
        REFRESH, headers={"Authorization": f"Bearer {_token(user_id, minutes_count=1)}"}
    ).json()["access_token"]

    response = client.get(ME, headers={"Authorization": f"Bearer {new_item}"})
    assert response.status_code == 200
    assert response.json()["email"] == "lucia@example.com"


def test_can_renew_several_times_in_a_row(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    for _ in range(3):
        response = client.post(REFRESH, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        token = response.json()["access_token"]

    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_refresh_with_token_expired_returns_401(client):
    user_id = _registrar_y_obtener_id(client)
    expired = _token(user_id, minutes_count=-1)

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {expired}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Token inválido o expirado."
    assert "access_token" not in response.json()


def test_refresh_without_token_returns_401(client):
    assert client.post(REFRESH).status_code == 401


def test_refresh_with_token_garbage_returns_401(client):
    response = client.post(REFRESH, headers={"Authorization": "Bearer esto.no.es.un.jwt"})

    assert response.status_code == 401


def test_refresh_with_token_signed_with_another_key_returns_401(client):
    user_id = _registrar_y_obtener_id(client)
    falso = jwt.encode(
        {"sub": user_id, "user_type": "client", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "otra-clave-que-no-es-la-del-servidor-123456",
        algorithm=JWT_ALGORITHM,
    )

    assert client.post(REFRESH, headers={"Authorization": f"Bearer {falso}"}).status_code == 401


def test_refresh_of_a_customer_that_already_no_exists_returns_401(client):
    # Token válido y firmado, pero el usuario fue borrado de la base.
    response = client.post(REFRESH, headers={"Authorization": f"Bearer {_token(9999, minutes_count=5)}"})

    assert response.status_code == 401


def _create_seller(db_session, email="vendedor@example.com"):
    return crud_user.create_employee(
        db_session, name="Vendedor Uno", email=email, password_hash=hash_password("secreto123")
    )


def test_login_of_seller_returns_token_with_user_type_employee(client, db_session):
    _create_seller(db_session)

    response = client.post(LOGIN, json={"email": "vendedor@example.com", "password": "secreto123"})

    assert response.status_code == 200
    assert _claims(response.json()["access_token"])["user_type"] == "employee"


def test_refresh_with_token_of_customer_keeps_user_type_client(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert _claims(response.json()["access_token"])["user_type"] == "client"


def test_refresh_with_token_of_seller_returns_token_new_of_seller(client, db_session):
    seller = _create_seller(db_session)
    old = _token(seller.user_id, minutes_count=2, user_type="employee")

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {old}"})

    assert response.status_code == 200
    new_item = _claims(response.json()["access_token"])
    assert new_item["sub"] == str(seller.user_id)
    assert new_item["user_type"] == "employee"
    assert new_item["exp"] > _claims(old)["exp"]


def test_refresh_uses_the_user_type_of_the_db_and_no_the_of_the_token(client, db_session):
    seller = _create_seller(db_session)
    # Token con un user_type que no coincide con el guardado.
    token = _token(seller.user_id, minutes_count=5, user_type="client")

    response = client.post(REFRESH, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert _claims(response.json()["access_token"])["user_type"] == "employee"


def test_refresh_of_a_seller_that_already_no_exists_returns_401(client):
    token = _token(9999, minutes_count=5, user_type="employee")

    assert client.post(REFRESH, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_add_to_the_cart_with_token_of_seller_returns_403(client, db_session):
    seller = _create_seller(db_session)
    token = _token(seller.user_id, minutes_count=5, user_type="employee")

    response = client.post(
        "/api/v1/cart/items",
        json={"part_id": 1, "amount": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Esta acción requiere una cuenta de cliente."


def test_profile_of_customer_with_token_of_seller_returns_403(client, db_session):
    seller = _create_seller(db_session)
    token = _token(seller.user_id, minutes_count=5, user_type="employee")

    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 403


# =====================================================
# Validaciones de nombre y contraseña
# =====================================================


@pytest.mark.parametrize("name", ["123", "Lucía @@", "L"])
def test_name_invalid_in_the_signup_returns_422(client, db_session, name):
    response = client.post(REGISTER, json=payload(name=name))

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert db_session.scalars(select(User)).all() == []


@pytest.mark.parametrize("password", ["abcdefgh", "12345678", "Password1", "lucia2026"])
def test_password_weak_in_the_signup_returns_422(client, db_session, password):
    response = client.post(REGISTER, json=payload(password=password))

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "password"]


def test_name_invalid_to_the_edit_the_profile_returns_422(client):
    response = client.patch(ME, json={"name": "Lucía 123"}, headers=_headers(client))

    assert response.status_code == 422


@pytest.mark.parametrize("new_value", ["solotexto", "qwerty123", "lucia-2026"])
def test_change_password_by_a_weak_returns_422(client, new_value):
    response = client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": new_value},
        headers=_headers(client),
    )

    assert response.status_code == 422
    assert client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).status_code == 200


# =====================================================
# Cierre de sesiones al cambiar la contraseña (session_version)
# =====================================================

RESET = "/api/v1/auth/password/reset"
ANALYTICS_EMPLEADO = "/api/v1/analytics/ping"  # exige get_current_employee


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _cambiar_password(client, token):
    return client.patch(
        PASSWORD,
        json={"current_password": "secreto123", "new_password": "nueva-clave-1"},
        headers=_bearer(token),
    )


def test_the_tokens_of_session_carry_the_version_of_session(client, db_session):
    registro = client.post(REGISTER, json=payload()).json()["access_token"]
    login = client.post(LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}).json()["access_token"]
    refreshed = client.post(REFRESH, headers=_bearer(login)).json()["access_token"]

    assert _claims(registro)["sv"] == 0
    assert _claims(login)["sv"] == 0
    assert _claims(refreshed)["sv"] == 0


def test_token_issued_before_of_change_the_password_returns_401(client):
    old = client.post(REGISTER, json=payload()).json()["access_token"]
    # Otro dispositivo con su propia sesión (el cambio se hace desde acá).
    other_device = client.post(
        LOGIN, json={"email": "lucia@example.com", "password": "secreto123"}
    ).json()["access_token"]

    assert _cambiar_password(client, old).status_code == 200

    for token in (old, other_device):
        response = client.get(ME, headers=_bearer(token))
        assert response.status_code == 401
        assert response.json()["detail"] == "Token inválido o expirado."


def test_change_password_returns_a_token_that_keeps_working(client):
    old = client.post(REGISTER, json=payload()).json()["access_token"]

    response = _cambiar_password(client, old)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert _claims(body["access_token"])["sv"] == 1
    assert client.get(ME, headers=_bearer(body["access_token"])).status_code == 200


def test_the_token_new_of_the_change_of_password_can_renew(client):
    old = client.post(REGISTER, json=payload()).json()["access_token"]
    new_item = _cambiar_password(client, old).json()["access_token"]

    response = client.post(REFRESH, headers=_bearer(new_item))

    assert response.status_code == 200
    assert _claims(response.json()["access_token"])["sv"] == 1


def test_a_change_of_password_failed_no_closes_the_sessions(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]

    response = client.patch(
        PASSWORD,
        json={"current_password": "incorrecta1", "new_password": "nueva-clave-1"},
        headers=_bearer(token),
    )

    assert response.status_code == 400
    assert client.get(ME, headers=_bearer(token)).status_code == 200


def test_the_login_after_of_the_change_brings_the_version_new(client):
    old = client.post(REGISTER, json=payload()).json()["access_token"]
    _cambiar_password(client, old)

    token = client.post(LOGIN, json={"email": "lucia@example.com", "password": "nueva-clave-1"}).json()["access_token"]

    assert _claims(token)["sv"] == 1
    assert client.get(ME, headers=_bearer(token)).status_code == 200


def test_reset_the_password_with_the_link_closes_the_sessions(client, db_session):
    old = client.post(REGISTER, json=payload()).json()["access_token"]
    customer = db_session.scalars(select(Client)).one()
    link = create_purpose_token(
        str(customer.user_id),
        RESET_PASSWORD,
        minutes_count=30,
        extra_claims={"pwd": password_fingerprint(customer.password)},
    )

    response = client.post(RESET, json={"token": link, "new_password": "Nueva2026x"})

    assert response.status_code == 204
    assert client.get(ME, headers=_bearer(old)).status_code == 401
    new_item = client.post(LOGIN, json={"email": "lucia@example.com", "password": "Nueva2026x"}).json()["access_token"]
    assert client.get(ME, headers=_bearer(new_item)).status_code == 200


def test_refresh_with_a_token_previous_to_the_change_of_password_returns_401(client):
    old = client.post(REGISTER, json=payload()).json()["access_token"]
    _cambiar_password(client, old)

    response = client.post(REFRESH, headers=_bearer(old))

    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_token_without_claim_sv_counts_while_the_version_is_0(client):
    user_id = _registrar_y_obtener_id(client)
    # Emitido antes del deploy: sin el claim `sv`.
    without_sv = create_access_token(subject=user_id, extra_claims={"user_type": "client"})
    assert "sv" not in _claims(without_sv)

    assert client.get(ME, headers=_bearer(without_sv)).status_code == 200
    assert client.post(REFRESH, headers=_bearer(without_sv)).status_code == 200


def test_token_without_claim_sv_leaves_of_count_after_of_change_the_password(client):
    token = client.post(REGISTER, json=payload()).json()["access_token"]
    without_sv = create_access_token(subject=_claims(token)["sub"], extra_claims={"user_type": "client"})
    _cambiar_password(client, token)

    assert client.get(ME, headers=_bearer(without_sv)).status_code == 401


@pytest.mark.parametrize("sv", ["0", 0.5, None, True, [0]])
def test_token_with_sv_that_no_is_integer_returns_401(client, sv):
    user_id = _registrar_y_obtener_id(client)
    token = create_access_token(subject=user_id, extra_claims={"user_type": "client", "sv": sv})

    assert client.get(ME, headers=_bearer(token)).status_code == 401


def test_token_of_employee_previous_to_the_change_of_password_returns_401(client, db_session):
    seller = _create_seller(db_session)
    old = create_access_token(
        subject=str(seller.user_id), extra_claims={"user_type": "employee", "sv": 0}
    )
    assert client.get(ANALYTICS_EMPLEADO, headers=_bearer(old)).status_code == 200

    crud_user.update_password(db_session, seller, hash_password("otra-clave-9"))

    assert client.get(ANALYTICS_EMPLEADO, headers=_bearer(old)).status_code == 401
    assert client.post(REFRESH, headers=_bearer(old)).status_code == 401
    new_item = create_access_token(
        subject=str(seller.user_id), extra_claims={"user_type": "employee", "sv": 1}
    )
    assert client.get(ANALYTICS_EMPLEADO, headers=_bearer(new_item)).status_code == 200
