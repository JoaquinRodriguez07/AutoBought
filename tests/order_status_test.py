"""El vendedor gestiona el estado de los pedidos (SCRUM-171).

Mercado Pago está simulado (ClienteMPFalso) y los mails van a la lista del
fixture `mails` (SMTP falso, ver conftest.py).
"""

import pytest

from app.core.mercadopago import MercadoPagoNoDisponible, get_cliente_mp
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.stock_alert import StockAlert
from backend.main import app
from order_test import auth_headers, make_client, make_part
from pago_test import ClienteMPFalso

ORDERS = "/api/v1/orders"


@pytest.fixture
def mp(client):
    falso = ClienteMPFalso()
    app.dependency_overrides[get_cliente_mp] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_cliente_mp, None)


@pytest.fixture
def vendedor(db_session):
    employee = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    return auth_headers(employee, "employee")


@pytest.fixture
def cliente(db_session):
    return make_client(db_session)


@pytest.fixture
def pastillas(db_session):
    # Lo que quedó después de la compra de 2.
    return make_part(db_session, stock=3, price=1500)


def hacer_pedido(db, cliente, part, cantidad=2, estado=OrderStatus.CONFIRMED, pago=PaymentStatus.APPROVED):
    """Un pedido ya hecho (el stock ya se descontó). `pago=None`: un pedido
    de antes de Mercado Pago, sin Payment."""
    order = Order(
        client_id=cliente.user_id, status=estado,
        ship_personal_name="Ana", ship_street="Av. Italia", ship_number="1234",
        ship_city="Montevideo", ship_department="Montevideo", payment_method_label="Mercado Pago",
    )
    if pago is not None:
        order.payment = Payment(status=pago, mp_payment_id="555" if pago == PaymentStatus.APPROVED else None)
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.order_id, part_id=part.id, quantity=cantidad, frozen_price=part.price))
    db.commit()
    return order.order_id


def cambiar(client, headers, order_id, estado, motivo=None):
    body = {"status": estado}
    if motivo is not None:
        body["reason"] = motivo
    return client.patch(f"{ORDERS}/{order_id}/status", headers=headers, json=body)


def estado(db, order_id):
    db.expire_all()
    return db.get(Order, order_id).status


def stock(db, part):
    db.expire_all()
    return db.get(Part, part.id).stock


def texto(mensaje):
    return mensaje.get_body(preferencelist=("plain",)).get_content()


# =====================================================
# Avanzar
# =====================================================


def test_avanzar_un_pedido_pagado_a_empaquetando_avisa_al_cliente(client, db_session, mp, vendedor, cliente, pastillas, mails):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    respuesta = cambiar(client, vendedor, order_id, "packing")

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "packing"
    assert respuesta.json()["next_status"] == "shipped"
    assert estado(db_session, order_id) == OrderStatus.PACKING
    assert [m["Subject"] for m in mails] == [f"Tu pedido #{order_id} se está preparando"]
    assert mails[0]["To"] == cliente.email
    assert "Lo estamos empaquetando" in texto(mails[0])


def test_avanza_de_a_un_paso_hasta_entregado_con_un_mail_en_cada_uno(client, db_session, mp, vendedor, cliente, pastillas, mails):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    for siguiente in ("packing", "shipped", "delivered"):
        assert cambiar(client, vendedor, order_id, siguiente).status_code == 200

    assert estado(db_session, order_id) == OrderStatus.DELIVERED
    assert [m["Subject"] for m in mails] == [
        f"Tu pedido #{order_id} se está preparando",
        f"Tu pedido #{order_id} fue enviado",
        f"Tu pedido #{order_id} fue entregado",
    ]
    assert stock(db_session, pastillas) == 3  # avanzar no toca el stock


@pytest.mark.parametrize(
    ("desde", "hacia"),
    [
        (OrderStatus.CONFIRMED, "delivered"),
        (OrderStatus.CONFIRMED, "shipped"),
        (OrderStatus.PACKING, "confirmed"),
        (OrderStatus.SHIPPED, "packing"),
        (OrderStatus.PACKING, "packing"),
    ],
)
def test_orden_invalido_da_409_y_el_estado_no_cambia(client, db_session, mp, vendedor, cliente, pastillas, mails, desde, hacia):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)

    respuesta = cambiar(client, vendedor, order_id, hacia)

    assert respuesta.status_code == 409
    assert estado(db_session, order_id) == desde
    assert mails == []


@pytest.mark.parametrize("pago", [PaymentStatus.PENDING, PaymentStatus.REJECTED])
def test_un_pedido_sin_pagar_no_se_puede_avanzar(client, db_session, mp, vendedor, cliente, pastillas, mails, pago):
    order_id = hacer_pedido(db_session, cliente, pastillas, pago=pago)

    respuesta = cambiar(client, vendedor, order_id, "packing")

    assert respuesta.status_code == 409
    assert "todavía no está pagado" in respuesta.json()["detail"]
    assert estado(db_session, order_id) == OrderStatus.CONFIRMED
    assert mails == []


def test_un_pedido_de_antes_de_mercado_pago_cuenta_como_pagado(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas, pago=None)

    assert cambiar(client, vendedor, order_id, "packing").status_code == 200


# =====================================================
# Cancelar
# =====================================================


@pytest.mark.parametrize("desde", [OrderStatus.CONFIRMED, OrderStatus.PACKING, OrderStatus.SHIPPED])
def test_cancelar_devuelve_el_pago_y_el_stock_y_avisa_con_el_motivo(client, db_session, mp, vendedor, cliente, pastillas, mails, desde):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)

    respuesta = cambiar(client, vendedor, order_id, "cancelled", "  Se rompió la caja en el depósito.  ")

    assert respuesta.status_code == 200
    assert respuesta.json()["cancellation_reason"] == "Se rompió la caja en el depósito."
    assert respuesta.json()["can_cancel"] is False
    assert estado(db_session, order_id) == OrderStatus.CANCELLED
    assert stock(db_session, pastillas) == 5
    assert mp.devoluciones == [("555", f"autobought-devolucion-pedido-{order_id}")]
    assert [m["Subject"] for m in mails] == [f"Cancelamos tu pedido #{order_id}"]
    assert "Motivo: Se rompió la caja en el depósito." in texto(mails[0])


@pytest.mark.parametrize("motivo", [None, "", "   ", "no"])
def test_cancelar_sin_motivo_da_422_y_no_cambia_nada(client, db_session, mp, vendedor, cliente, pastillas, mails, motivo):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    respuesta = cambiar(client, vendedor, order_id, "cancelled", motivo)

    assert respuesta.status_code == 422
    assert estado(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3
    assert mp.devoluciones == []
    assert mails == []


@pytest.mark.parametrize("desde", [OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_no_se_cancela_un_pedido_entregado_ni_uno_ya_cancelado(client, db_session, mp, vendedor, cliente, pastillas, mails, desde):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)

    respuesta = cambiar(client, vendedor, order_id, "cancelled", "El cliente se arrepintió")

    assert respuesta.status_code == 409
    assert estado(db_session, order_id) == desde
    assert stock(db_session, pastillas) == 3  # el stock no vuelve dos veces
    assert mp.devoluciones == []
    assert mails == []


def test_un_pedido_sin_pagar_no_se_cancela_a_mano(client, db_session, mp, vendedor, cliente, pastillas, mails):
    # Se cancela solo al vencer el plazo; cancelarlo antes dejaría vivo el link de pago.
    order_id = hacer_pedido(db_session, cliente, pastillas, pago=PaymentStatus.PENDING)

    respuesta = cambiar(client, vendedor, order_id, "cancelled", "El cliente se arrepintió")

    assert respuesta.status_code == 409
    assert "se cancela solo" in respuesta.json()["detail"]
    assert estado(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3


def test_si_mercado_pago_no_devuelve_el_pago_el_pedido_no_se_cancela(client, db_session, mp, vendedor, cliente, pastillas, mails, caplog):
    order_id = hacer_pedido(db_session, cliente, pastillas)
    mp.error = MercadoPagoNoDisponible("Mercado Pago respondió con error 500")

    respuesta = cambiar(client, vendedor, order_id, "cancelled", "Sin stock real en el depósito")

    assert respuesta.status_code == 503
    assert estado(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3
    assert mails == []
    assert "No se pudo devolver el pago del pedido" in caplog.text

    # Al reintentar con Mercado Pago andando, se cancela.
    mp.error = None
    assert cambiar(client, vendedor, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200
    assert stock(db_session, pastillas) == 5


def test_cancelar_un_pedido_de_antes_de_mercado_pago_queda_en_el_log(client, db_session, mp, vendedor, cliente, pastillas, caplog):
    order_id = hacer_pedido(db_session, cliente, pastillas, pago=None)

    assert cambiar(client, vendedor, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200

    assert mp.devoluciones == []
    assert "devolver el dinero a mano" in caplog.text


def test_cancelar_avisa_a_quienes_esperaban_un_repuesto_agotado(client, db_session, mp, vendedor, cliente, mails):
    agotado = make_part(db_session, part_code="ACE-001", name="Aceite 10W-40", stock=0)
    order_id = hacer_pedido(db_session, cliente, agotado, cantidad=1)
    otro = make_client(db_session, username="beto", email="beto@example.com")
    db_session.add(StockAlert(client_id=otro.user_id, part_id=agotado.id))
    db_session.commit()

    assert cambiar(client, vendedor, order_id, "cancelled", "El cliente se arrepintió").status_code == 200

    assert stock(db_session, agotado) == 1
    asuntos = {(m["To"], m["Subject"]) for m in mails}
    assert ("beto@example.com", "Volvió a haber stock de Aceite 10W-40") in asuntos
    assert (cliente.email, f"Cancelamos tu pedido #{order_id}") in asuntos


def test_el_cliente_ve_el_motivo_en_su_historial(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)
    cambiar(client, vendedor, order_id, "cancelled", "Sin stock real en el depósito")

    pedido = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(cliente)).json()

    assert pedido["status"] == "cancelled"
    assert pedido["cancellation_reason"] == "Sin stock real en el depósito"


# =====================================================
# Permisos
# =====================================================


def test_solo_vendedores_pueden_cambiar_el_estado(client, db_session, mp, cliente, pastillas, mails):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    assert cambiar(client, auth_headers(cliente), order_id, "packing").status_code == 403
    assert cambiar(client, {}, order_id, "packing").status_code == 401
    assert estado(db_session, order_id) == OrderStatus.CONFIRMED
    assert mails == []


def test_un_pedido_que_no_existe_da_404(client, mp, vendedor):
    assert cambiar(client, vendedor, 999, "packing").status_code == 404


# =====================================================
# Listado del portal
# =====================================================


def test_el_listado_filtra_por_estado_y_dice_que_se_puede_hacer(client, db_session, mp, vendedor, cliente, pastillas):
    pagado = hacer_pedido(db_session, cliente, pastillas)
    sin_pagar = hacer_pedido(db_session, cliente, pastillas, pago=PaymentStatus.PENDING)
    hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.PACKING)
    hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.DELIVERED)

    todos = client.get(f"{ORDERS}/seller", headers=vendedor).json()
    confirmados = client.get(f"{ORDERS}/seller", headers=vendedor, params={"status": "confirmed"}).json()

    assert todos["total"] == 4
    assert todos["counts"] == {"confirmed": 2, "packing": 1, "delivered": 1}
    assert todos["to_prepare"] == 1  # el confirmado sin pagar no cuenta
    assert confirmados["total"] == 2
    por_id = {o["order_id"]: o for o in confirmados["orders"]}
    assert por_id[pagado]["next_status"] == "packing"
    assert por_id[pagado]["can_cancel"] is True
    assert por_id[pagado]["client_name"] == "Ana"
    assert por_id[pagado]["client_email"] == cliente.email
    assert por_id[sin_pagar]["next_status"] is None
    assert por_id[sin_pagar]["can_cancel"] is False
    assert por_id[sin_pagar]["payment_status"] == "pending"


def test_el_listado_pagina(client, db_session, mp, vendedor, cliente, pastillas):
    ids = [hacer_pedido(db_session, cliente, pastillas) for _ in range(3)]

    pagina = client.get(f"{ORDERS}/seller", headers=vendedor, params={"status": "confirmed", "limit": 2}).json()
    resto = client.get(
        f"{ORDERS}/seller", headers=vendedor, params={"status": "confirmed", "limit": 2, "offset": 2}
    ).json()

    # En curso: el que lleva más esperando, primero.
    assert [o["order_id"] for o in pagina["orders"] + resto["orders"]] == ids
    assert pagina["total"] == 3


def test_el_listado_es_solo_para_vendedores(client, cliente):
    assert client.get(f"{ORDERS}/seller", headers=auth_headers(cliente)).status_code == 403
    assert client.get(f"{ORDERS}/seller").status_code == 401


# =====================================================
# Detalle del pedido en el portal
# =====================================================


def test_el_detalle_trae_productos_envio_cliente_y_pago(client, db_session, mp, vendedor, cliente, pastillas):
    cliente.phone = "099123456"
    db_session.commit()
    order_id = hacer_pedido(db_session, cliente, pastillas, cantidad=2)

    respuesta = client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor)

    assert respuesta.status_code == 200
    pedido = respuesta.json()
    assert pedido["items"] == [
        {"part_id": pastillas.id, "part_code": "BRK-001", "name": "Pastillas de freno", "quantity": 2, "frozen_price": 1500}
    ]
    assert pedido["total"] == 3000
    assert pedido["shipping_address"]["street"] == "Av. Italia"
    assert pedido["shipping_address"]["personal_name"] == "Ana"
    assert (pedido["client_name"], pedido["client_email"], pedido["client_phone"]) == ("Ana", cliente.email, "099123456")
    assert (pedido["payment_status"], pedido["mp_payment_id"]) == ("approved", "555")
    assert pedido["next_status"] == "packing"
    assert pedido["can_cancel"] is True


def test_el_detalle_de_un_pedido_que_no_existe_da_404(client, vendedor):
    assert client.get(f"{ORDERS}/seller/999", headers=vendedor).status_code == 404


def test_el_detalle_es_solo_para_vendedores(client, db_session, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    assert client.get(f"{ORDERS}/seller/{order_id}", headers=auth_headers(cliente)).status_code == 403
    assert client.get(f"{ORDERS}/seller/{order_id}").status_code == 401


def test_el_listado_puede_traer_solo_los_pagados_para_preparar(client, db_session, mp, vendedor, cliente, pastillas):
    pagado = hacer_pedido(db_session, cliente, pastillas)
    viejo = hacer_pedido(db_session, cliente, pastillas, pago=None)  # de antes de Mercado Pago: ya cobrado
    hacer_pedido(db_session, cliente, pastillas, pago=PaymentStatus.PENDING)
    hacer_pedido(db_session, cliente, pastillas, pago=PaymentStatus.REJECTED)

    respuesta = client.get(
        f"{ORDERS}/seller", headers=vendedor, params={"status": "confirmed", "paid_only": "true"}
    ).json()

    assert [o["order_id"] for o in respuesta["orders"]] == [pagado, viejo]
    assert respuesta["total"] == 2 == respuesta["to_prepare"]
