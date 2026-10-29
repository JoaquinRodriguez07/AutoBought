from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token, hash_password
from app.crud import part as crud_part
from app.crud import user as crud_user
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus

EVOLUCION = "/api/v1/analytics/sales-evolution"
URUGUAY = crud_part.URUGUAY


def _headers_vendedor(db_session):
    vendedor = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    token = create_access_token(subject=str(vendedor.user_id), extra_claims={"user_type": "employee"})
    return {"Authorization": f"Bearer {token}"}


def _cliente(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


def _repuesto(db_session, codigo, categoria="Frenos", precio=1000):
    part = Part(
        part_code=codigo,
        name=f"Repuesto {codigo}",
        manufacturer="Bosch",
        category=categoria,
        price=precio,
        stock=10,
    )
    db_session.add(part)
    db_session.commit()
    return part


def _pedido(db_session, cliente, items, fecha, estado=OrderStatus.CONFIRMED, pago=None):
    order = Order(
        client_id=cliente.user_id,
        created_at=fecha,
        status=estado,
        ship_personal_name=cliente.name,
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Mercado Pago",
        payment=Payment(status=pago) if pago else None,
        items=[OrderItem(part=part, quantity=cantidad, frozen_price=part.price) for part, cantidad in items],
    )
    db_session.add(order)
    db_session.commit()
    return order


def _meses_atras(cantidad):
    """Mediodía del 15 de hace `cantidad` meses (hora de Uruguay): cae siempre
    en ese mes, corra el test el día que lo corra."""
    hoy = datetime.now(URUGUAY)
    indice = hoy.year * 12 + hoy.month - 1 - cantidad
    return datetime(indice // 12, indice % 12 + 1, 15, 12, tzinfo=URUGUAY)


def _por_mes(body):
    return {fila["month"]: fila for fila in body["points"]}


def _clave(fecha):
    return f"{fecha.year}-{fecha.month:02d}"


# --- Acceso ---


def test_evolucion_requiere_vendedor(client, db_session):
    cliente = _cliente(db_session)
    token_cliente = create_access_token(subject=str(cliente.user_id), extra_claims={"user_type": "client"})

    assert client.get(EVOLUCION).status_code == 401
    assert client.get(EVOLUCION, headers={"Authorization": f"Bearer {token_cliente}"}).status_code == 403


# --- Escenario: ver la evolución mensual ---


def test_devuelve_los_ultimos_12_meses_con_ceros_donde_no_hubo_ventas(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001")
    _pedido(db_session, cliente, [(pastillas, 3)], _meses_atras(5))

    body = client.get(EVOLUCION, headers=headers).json()

    assert body["months"] == 12
    assert body["category"] is None
    assert len(body["points"]) == 12
    meses = [fila["month"] for fila in body["points"]]
    assert meses == sorted(meses) and len(set(meses)) == 12
    assert meses[-1] == _clave(datetime.now(URUGUAY))
    assert [fila["units_sold"] for fila in body["points"]] == [0] * 6 + [3] + [0] * 5
    assert body["points"][6]["month"] == _clave(_meses_atras(5))


def test_solo_el_mes_actual_viene_marcado_como_parcial(client, db_session):
    body = client.get(EVOLUCION, headers=_headers_vendedor(db_session)).json()

    assert [fila["partial"] for fila in body["points"]] == [False] * 11 + [True]


def test_suma_unidades_y_factura_con_el_precio_de_la_venta(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001", precio=1000)
    discos = _repuesto(db_session, "FRE-002", precio=4000)
    _pedido(db_session, cliente, [(pastillas, 2), (discos, 1)], _meses_atras(2))
    _pedido(db_session, cliente, [(pastillas, 3)], _meses_atras(2))
    # El precio de hoy no cambia lo que se facturó.
    pastillas.price = 9999
    db_session.commit()

    fila = _por_mes(client.get(EVOLUCION, headers=headers).json())[_clave(_meses_atras(2))]

    assert fila["units_sold"] == 6
    assert fila["revenue"] == 2 * 1000 + 4000 + 3 * 1000


def test_no_cuenta_cancelados_ni_pagos_pendientes_o_rechazados(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001")
    fecha = _meses_atras(1)
    _pedido(db_session, cliente, [(pastillas, 100)], fecha, estado=OrderStatus.CANCELLED)
    _pedido(db_session, cliente, [(pastillas, 100)], fecha, pago=PaymentStatus.PENDING)
    _pedido(db_session, cliente, [(pastillas, 100)], fecha, pago=PaymentStatus.REJECTED)
    _pedido(db_session, cliente, [(pastillas, 2)], fecha, pago=PaymentStatus.APPROVED)
    _pedido(db_session, cliente, [(pastillas, 1)], fecha)  # anterior a Mercado Pago: sin pago

    fila = _por_mes(client.get(EVOLUCION, headers=headers).json())[_clave(fecha)]

    assert fila["units_sold"] == 3


# --- Período ---


def test_el_periodo_define_cuantos_meses_se_devuelven(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001")
    _pedido(db_session, cliente, [(pastillas, 1)], _meses_atras(8))
    _pedido(db_session, cliente, [(pastillas, 4)], _meses_atras(1))

    seis = client.get(EVOLUCION, params={"months": 6}, headers=headers).json()
    veinticuatro = client.get(EVOLUCION, params={"months": 24}, headers=headers).json()

    assert seis["months"] == 6
    assert [fila["units_sold"] for fila in seis["points"]] == [0, 0, 0, 0, 4, 0]  # el de hace 8 meses queda afuera
    assert len(veinticuatro["points"]) == 24
    assert sum(fila["units_sold"] for fila in veinticuatro["points"]) == 5


def test_rechaza_un_periodo_fuera_de_rango(client, db_session):
    headers = _headers_vendedor(db_session)

    assert client.get(EVOLUCION, params={"months": 0}, headers=headers).status_code == 422
    assert client.get(EVOLUCION, params={"months": 37}, headers=headers).status_code == 422


# --- Escenario: filtrar por categoría ---


def test_filtrar_por_categoria_cuenta_solo_esa_categoria(client, db_session):
    headers = _headers_vendedor(db_session)
    cliente = _cliente(db_session)
    pastillas = _repuesto(db_session, "FRE-001", categoria="Frenos", precio=1000)
    filtro = _repuesto(db_session, "MOT-001", categoria="Motor", precio=500)
    # Un mismo pedido con repuestos de las dos categorías: cada ítem va a la suya.
    _pedido(db_session, cliente, [(pastillas, 2), (filtro, 7)], _meses_atras(3))

    frenos = client.get(EVOLUCION, params={"category": "Frenos"}, headers=headers).json()
    toda_la_tienda = client.get(EVOLUCION, headers=headers).json()

    mes = _clave(_meses_atras(3))
    assert frenos["category"] == "Frenos"
    assert _por_mes(frenos)[mes]["units_sold"] == 2
    assert _por_mes(frenos)[mes]["revenue"] == 2000
    assert _por_mes(toda_la_tienda)[mes]["units_sold"] == 9
    assert _por_mes(toda_la_tienda)[mes]["revenue"] == 2000 + 7 * 500


def test_categoria_sin_ventas_devuelve_ceros(client, db_session):
    headers = _headers_vendedor(db_session)
    _repuesto(db_session, "FRE-001", categoria="Frenos")

    body = client.get(EVOLUCION, params={"category": "Frenos"}, headers=headers).json()

    assert len(body["points"]) == 12
    assert all(fila["units_sold"] == 0 and fila["revenue"] == 0 for fila in body["points"])


def test_categoria_inexistente_devuelve_404(client, db_session):
    headers = _headers_vendedor(db_session)
    _repuesto(db_session, "FRE-001", categoria="Frenos")

    response = client.get(EVOLUCION, params={"category": "Frenoss"}, headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "La categoría no existe."


# --- Cómo se cortan los meses ---


def _ventas_en(db_session, fechas, now, months=3):
    cliente = _cliente(db_session)
    part = _repuesto(db_session, "FRE-001")
    for fecha in fechas:
        # SQLite guarda la fecha sin zona y la app escribe en UTC: se inserta
        # en UTC, que es lo que devuelve Postgres con timestamptz.
        _pedido(db_session, cliente, [(part, 1)], fecha.astimezone(timezone.utc))
    return crud_part.list_monthly_sales(db_session, months=months, now=now)


def test_el_corte_de_mes_es_en_hora_de_uruguay(db_session):
    ahora = datetime(2026, 10, 20, 12, tzinfo=URUGUAY)
    filas = _ventas_en(
        db_session,
        [
            # 30/09 23:30 en Uruguay = 01/10 02:30 UTC: sigue siendo septiembre.
            datetime(2026, 9, 30, 23, 30, tzinfo=URUGUAY),
            # 01/10 00:30 en Uruguay = 01/10 03:30 UTC: ya es octubre.
            datetime(2026, 10, 1, 0, 30, tzinfo=URUGUAY),
        ],
        ahora,
    )

    assert [(f["month"], f["units_sold"]) for f in filas] == [("2026-08", 0), ("2026-09", 1), ("2026-10", 1)]


def test_la_ventana_cruza_el_cambio_de_anio(db_session):
    ahora = datetime(2026, 2, 10, 12, tzinfo=URUGUAY)
    filas = _ventas_en(
        db_session,
        [datetime(2025, 12, 31, 22, tzinfo=timezone.utc), datetime(2025, 11, 5, tzinfo=timezone.utc)],
        ahora,
        months=4,
    )

    assert [(f["month"], f["units_sold"]) for f in filas] == [
        ("2025-11", 1),
        ("2025-12", 1),
        ("2026-01", 0),
        ("2026-02", 0),
    ]


def test_un_pedido_justo_antes_de_la_ventana_no_entra(db_session):
    ahora = datetime(2026, 10, 20, 12, tzinfo=URUGUAY)
    filas = _ventas_en(db_session, [datetime(2026, 7, 31, 23, 59, tzinfo=URUGUAY)], ahora)

    assert sum(f["units_sold"] for f in filas) == 0
