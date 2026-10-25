from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import create_access_token, hash_password
from app.crud import user as crud_user
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part

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


# --- Stock y más vendidos del dashboard (HU 5.2 y 5.3) ---

STOCK = "/api/v1/analytics/stock"
MAS_VENDIDOS = "/api/v1/analytics/best-sellers"


def _headers_vendedor(db_session):
    vendedor = _vendedor(db_session)
    return _headers(_token(vendedor.user_id, "employee"))


def _repuesto(db_session, codigo, stock, categoria="Frenos"):
    part = Part(
        part_code=codigo,
        name=f"Repuesto {codigo}",
        manufacturer="Bosch",
        category=categoria,
        price=1000,
        stock=stock,
    )
    db_session.add(part)
    db_session.commit()
    return part


def _pedido(db_session, cliente, items, dias_atras=1, estado=OrderStatus.CONFIRMED):
    order = Order(
        client_id=cliente.user_id,
        created_at=datetime.now(timezone.utc) - timedelta(days=dias_atras),
        status=estado,
        ship_personal_name=cliente.name,
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Visa •••• 1234",
        items=[OrderItem(part=part, quantity=cantidad, frozen_price=part.price) for part, cantidad in items],
    )
    db_session.add(order)
    db_session.commit()
    return order


def test_stock_requiere_vendedor(client, db_session):
    cliente = _cliente(db_session)

    assert client.get(STOCK).status_code == 401
    assert client.get(STOCK, headers=_headers(_token(cliente.user_id, "client"))).status_code == 403


def test_stock_lista_todos_los_repuestos_de_menos_a_mas_stock(client, db_session):
    _repuesto(db_session, "FRE-001", stock=20)
    _repuesto(db_session, "FRE-002", stock=0)
    _repuesto(db_session, "FRE-003", stock=5)

    body = client.get(STOCK, headers=_headers_vendedor(db_session)).json()

    assert body["low_stock_threshold"] == 5
    assert [(p["part_code"], p["stock"], p["low_stock"]) for p in body["parts"]] == [
        ("FRE-002", 0, True),
        ("FRE-003", 5, True),
        ("FRE-001", 20, False),
    ]
    assert body["parts"][0]["name"] == "Repuesto FRE-002"


def test_stock_con_otro_umbral_de_stock_bajo(client, db_session):
    _repuesto(db_session, "FRE-001", stock=8)

    body = client.get(STOCK, params={"low_stock_threshold": 10}, headers=_headers_vendedor(db_session)).json()

    assert body["low_stock_threshold"] == 10
    assert body["parts"][0]["low_stock"] is True


def test_stock_refleja_los_cambios_de_stock(client, db_session):
    headers = _headers_vendedor(db_session)
    part = _repuesto(db_session, "FRE-001", stock=20)
    assert client.get(STOCK, headers=headers).json()["parts"][0]["low_stock"] is False

    part.stock = 2
    db_session.commit()

    assert client.get(STOCK, headers=headers).json()["parts"][0]["stock"] == 2
    assert client.get(STOCK, headers=headers).json()["parts"][0]["low_stock"] is True


def test_stock_rechaza_un_umbral_negativo(client, db_session):
    response = client.get(STOCK, params={"low_stock_threshold": -1}, headers=_headers_vendedor(db_session))

    assert response.status_code == 422


def test_mas_vendidos_requiere_vendedor(client, db_session):
    cliente = _cliente(db_session)

    assert client.get(MAS_VENDIDOS).status_code == 401
    assert client.get(MAS_VENDIDOS, headers=_headers(_token(cliente.user_id, "client"))).status_code == 403


def test_mas_vendidos_ordena_por_unidades_vendidas(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001", stock=10)
    discos = _repuesto(db_session, "FRE-002", stock=10)
    _repuesto(db_session, "FRE-003", stock=10)  # nunca se vendió
    _pedido(db_session, cliente, [(pastillas, 2), (discos, 3)])
    _pedido(db_session, cliente, [(discos, 4)])

    body = client.get(MAS_VENDIDOS, headers=headers).json()

    assert body["days"] is None
    assert [(p["part_code"], p["units_sold"]) for p in body["parts"]] == [("FRE-002", 7), ("FRE-001", 2)]


def test_mas_vendidos_incluye_los_agotados_y_no_cuenta_cancelados(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    agotado = _repuesto(db_session, "FRE-001", stock=0)
    otro = _repuesto(db_session, "FRE-002", stock=10)
    _pedido(db_session, cliente, [(agotado, 3)])
    _pedido(db_session, cliente, [(otro, 50)], estado=OrderStatus.CANCELLED)

    body = client.get(MAS_VENDIDOS, headers=headers).json()

    assert [(p["part_code"], p["stock"], p["units_sold"]) for p in body["parts"]] == [("FRE-001", 0, 3)]


def test_mas_vendidos_por_periodo_y_con_limite(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    viejo = _repuesto(db_session, "FRE-001", stock=10)
    reciente = _repuesto(db_session, "FRE-002", stock=10)
    tercero = _repuesto(db_session, "FRE-003", stock=10)
    _pedido(db_session, cliente, [(viejo, 100)], dias_atras=200)
    _pedido(db_session, cliente, [(reciente, 5), (tercero, 1)], dias_atras=3)

    ultimo_mes = client.get(MAS_VENDIDOS, params={"days": 30}, headers=headers).json()
    top_1 = client.get(MAS_VENDIDOS, params={"limit": 1}, headers=headers).json()

    assert ultimo_mes["days"] == 30
    assert [p["part_code"] for p in ultimo_mes["parts"]] == ["FRE-002", "FRE-003"]
    assert [p["part_code"] for p in top_1["parts"]] == ["FRE-001"]
