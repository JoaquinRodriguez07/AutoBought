from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import create_access_token, hash_password
from app.crud import user as crud_user

PING = "/api/v1/analytics/ping"


def _token(subject, user_type, minutos=5):
    payload = {
        "sub": str(subject),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutos),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _vendedor(db_session):
    return crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )


def _cliente(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


def test_ping_con_token_de_vendedor_devuelve_200(client, db_session):
    vendedor = _vendedor(db_session)

    response = client.get(PING, headers=_headers(_token(vendedor.user_id, "employee")))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ping_con_token_de_cliente_devuelve_403(client, db_session):
    cliente = _cliente(db_session)

    response = client.get(PING, headers=_headers(_token(cliente.user_id, "client")))

    assert response.status_code == 403
    assert response.json()["detail"] == "Esta acción requiere una cuenta de vendedor."


def test_ping_sin_token_devuelve_401(client):
    assert client.get(PING).status_code == 401


def test_ping_con_token_basura_devuelve_401(client):
    assert client.get(PING, headers=_headers("esto.no.es.un.jwt")).status_code == 401


def test_ping_con_token_vencido_devuelve_401(client, db_session):
    vendedor = _vendedor(db_session)

    response = client.get(PING, headers=_headers(_token(vendedor.user_id, "employee", minutos=-1)))

    assert response.status_code == 401
    assert response.json()["detail"] == "Token inválido o expirado."


def test_ping_con_vendedor_que_ya_no_existe_devuelve_401(client):
    assert client.get(PING, headers=_headers(_token(9999, "employee"))).status_code == 401


def test_ping_con_token_de_vendedor_pero_id_de_un_cliente_devuelve_401(client, db_session):
    # El user_type del token dice vendedor pero el id es de un cliente: no
    # existe como empleado, no se le da acceso.
    cliente = _cliente(db_session)

    response = client.get(PING, headers=_headers(_token(cliente.user_id, "employee")))

    assert response.status_code == 401


def test_el_token_del_login_de_vendedor_sirve_para_analytics(client, db_session):
    _vendedor(db_session)
    token = client.post(
        "/api/v1/auth/login", json={"email": "vendedor@example.com", "password": "secreto123"}
    ).json()["access_token"]

    assert client.get(PING, headers=_headers(token)).status_code == 200


def test_el_token_del_login_de_cliente_no_sirve_para_analytics(client, db_session):
    _cliente(db_session)
    token = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "secreto123"}
    ).json()["access_token"]

    assert client.get(PING, headers=_headers(token)).status_code == 403


def test_token_emitido_con_create_access_token_para_empleado_sirve(client, db_session):
    vendedor = _vendedor(db_session)
    token = create_access_token(subject=str(vendedor.user_id), extra_claims={"user_type": "employee"})

    assert client.get(PING, headers=_headers(token)).status_code == 200
