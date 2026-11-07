"""El vendedor gestiona el estado de los pedidos (SCRUM-171).

Mercado Pago está simulado (ClienteMPFalso) y los mails van a la lista del
fixture `mails` (SMTP falso, ver conftest.py).
"""

from datetime import datetime, timezone

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
        (OrderStatus.SHIPPED, "confirmed"),  # volver, solo de a un paso
        (OrderStatus.DELIVERED, "packing"),
        (OrderStatus.CANCELLED, "shipped"),  # un cancelado no se reabre
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
    # En el historial queda como cancelado por la tienda (no como vencido).
    assert pedido["cancel_reason"] == "store"
    assert pedido["status_history"][-1]["status"] == "cancelled"


def test_cada_paso_del_vendedor_queda_en_la_linea_de_tiempo_del_cliente(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)
    cambiar(client, vendedor, order_id, "packing")
    cambiar(client, vendedor, order_id, "shipped")

    pedido = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(cliente)).json()

    pasos = [paso["status"] for paso in pedido["status_history"]]
    assert pasos[-2:] == ["packing", "shipped"]
    assert all(paso["changed_at"] for paso in pedido["status_history"][-2:])


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


def test_el_listado_se_ordena_por_fecha_cliente_o_total(client, db_session, mp, vendedor, pastillas):
    bruno = make_client(db_session, username="bruno", email="bruno@example.com")
    bruno.name = "bruno Díaz"  # en minúscula: el orden no distingue mayúsculas
    carla = make_client(db_session, username="carla", email="carla@example.com")
    carla.name = "Carla Pérez"
    ana = make_client(db_session, username="ana2", email="ana2@example.com")  # se llama "Ana"
    db_session.commit()
    # Total: 1 × 1500, 3 × 1500 y 2 × 1500.
    de_bruno = hacer_pedido(db_session, bruno, pastillas, cantidad=1)
    de_carla = hacer_pedido(db_session, carla, pastillas, cantidad=3)
    de_ana = hacer_pedido(db_session, ana, pastillas, cantidad=2)
    for order_id, dia in ((de_bruno, 3), (de_carla, 1), (de_ana, 2)):
        db_session.get(Order, order_id).created_at = datetime(2026, 11, dia, tzinfo=timezone.utc)
    db_session.commit()

    def ids(orden):
        respuesta = client.get(f"{ORDERS}/seller", headers=vendedor, params={"sort": orden})
        assert respuesta.status_code == 200
        return [o["order_id"] for o in respuesta.json()["orders"]]

    assert ids("newest") == [de_bruno, de_ana, de_carla]
    assert ids("oldest") == [de_carla, de_ana, de_bruno]
    assert ids("client_asc") == [de_ana, de_bruno, de_carla]
    assert ids("client_desc") == [de_carla, de_bruno, de_ana]
    assert ids("total_desc") == [de_carla, de_ana, de_bruno]
    assert ids("total_asc") == [de_bruno, de_ana, de_carla]
    # Sin `sort`, como siempre: con el filtro de un estado en curso, el que más espera primero.
    sin_orden = client.get(f"{ORDERS}/seller", headers=vendedor, params={"status": "confirmed"}).json()
    assert [o["order_id"] for o in sin_orden["orders"]] == [de_carla, de_ana, de_bruno]


def test_un_orden_que_no_existe_da_422(client, vendedor):
    assert client.get(f"{ORDERS}/seller", headers=vendedor, params={"sort": "precio"}).status_code == 422


# =====================================================
# Volver un paso atrás
# =====================================================


@pytest.mark.parametrize(
    ("desde", "hacia"),
    [
        (OrderStatus.PACKING, OrderStatus.CONFIRMED),
        (OrderStatus.SHIPPED, OrderStatus.PACKING),
        (OrderStatus.DELIVERED, OrderStatus.SHIPPED),
    ],
)
def test_volver_un_paso_atras_corrige_sin_mandar_mail(client, db_session, mp, vendedor, cliente, pastillas, mails, desde, hacia):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()["previous_status"] == hacia.value

    respuesta = cambiar(client, vendedor, order_id, hacia.value)

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == hacia.value
    assert estado(db_session, order_id) == hacia
    assert stock(db_session, pastillas) == 3  # el stock no se toca
    assert mails == []


def test_no_hay_a_donde_volver_si_esta_confirmado_cancelado_o_sin_pagar(client, db_session, mp, vendedor, cliente, pastillas):
    confirmado = hacer_pedido(db_session, cliente, pastillas)
    cancelado = hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.CANCELLED)
    sin_pagar = hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.PACKING, pago=PaymentStatus.PENDING)

    for order_id in (confirmado, cancelado, sin_pagar):
        assert client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()["previous_status"] is None
    assert cambiar(client, vendedor, sin_pagar, "confirmed").status_code == 409


# =====================================================
# Editar el pedido: dirección de envío y nota interna
# =====================================================

DIRECCION_NUEVA = {
    "personal_name": "Casa",
    "street": "Bv. Artigas",
    "number": "1500",
    "apartment": "302",
    "city": "Montevideo",
    "department": "Montevideo",
    "postal_code": "11300",
}


def editar(client, headers, order_id, body):
    return client.patch(f"{ORDERS}/seller/{order_id}", headers=headers, json=body)


@pytest.mark.parametrize("desde", [OrderStatus.CONFIRMED, OrderStatus.PACKING])
def test_el_vendedor_corrige_la_direccion_mientras_no_se_envio(client, db_session, mp, vendedor, cliente, pastillas, mails, desde):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)

    respuesta = editar(client, vendedor, order_id, {"shipping_address": DIRECCION_NUEVA})

    assert respuesta.status_code == 200
    assert respuesta.json()["shipping_address"] == DIRECCION_NUEVA
    assert respuesta.json()["can_edit_shipping"] is True
    # El cliente ve la dirección corregida en su historial.
    pedido = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(cliente)).json()
    assert pedido["shipping_address"]["street"] == "Bv. Artigas"
    assert estado(db_session, order_id) == desde
    assert mails == []


@pytest.mark.parametrize("desde", [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_la_direccion_no_se_cambia_si_el_pedido_ya_salio(client, db_session, mp, vendedor, cliente, pastillas, desde):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=desde)

    respuesta = editar(client, vendedor, order_id, {"shipping_address": DIRECCION_NUEVA})

    assert respuesta.status_code == 409
    db_session.expire_all()
    assert db_session.get(Order, order_id).ship_street == "Av. Italia"
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()["can_edit_shipping"] is False


@pytest.mark.parametrize(
    "cambio",
    [
        {"street": ""},
        {"department": "Atlántida"},
        {"city": "Salto", "department": "Montevideo"},  # una ciudad que es otro departamento
    ],
)
def test_una_direccion_invalida_da_422(client, db_session, mp, vendedor, cliente, pastillas, cambio):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    respuesta = editar(client, vendedor, order_id, {"shipping_address": {**DIRECCION_NUEVA, **cambio}})

    assert respuesta.status_code == 422
    db_session.expire_all()
    assert db_session.get(Order, order_id).ship_street == "Av. Italia"


def test_la_nota_interna_se_guarda_y_el_cliente_no_la_ve(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.DELIVERED)

    respuesta = editar(client, vendedor, order_id, {"internal_note": "  Pidió que se entregue de tarde.  "})

    assert respuesta.status_code == 200
    assert respuesta.json()["internal_note"] == "Pidió que se entregue de tarde."
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()["internal_note"] == "Pidió que se entregue de tarde."
    historial = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(cliente)).json()
    assert "internal_note" not in historial
    assert "Pidió que se entregue" not in str(client.get(ORDERS, headers=auth_headers(cliente)).json())

    # Vacía, se borra.
    assert editar(client, vendedor, order_id, {"internal_note": "   "}).json()["internal_note"] is None


def test_editar_sin_nada_o_borrando_la_direccion_da_422(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    assert editar(client, vendedor, order_id, {}).status_code == 422
    assert editar(client, vendedor, order_id, {"shipping_address": None}).status_code == 422
    assert editar(client, vendedor, order_id, {"internal_note": "x" * 501}).status_code == 422


def test_editar_es_solo_para_vendedores_y_de_pedidos_que_existen(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    assert editar(client, auth_headers(cliente), order_id, {"internal_note": "hola"}).status_code == 403
    assert editar(client, {}, order_id, {"internal_note": "hola"}).status_code == 401
    assert editar(client, vendedor, 999, {"internal_note": "hola"}).status_code == 404



# =====================================================
# Devolución del pago
# =====================================================


def test_cancelar_anota_cuando_se_devolvio_el_pago(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas)

    cambiar(client, vendedor, order_id, "cancelled", "Se rompió la caja en el depósito.")

    detalle = client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()
    assert detalle["refunded_at"] is not None
    assert detalle["refund_pending"] is False


def test_el_detalle_avisa_si_falta_devolver_el_pago(client, db_session, mp, vendedor, cliente, pastillas):
    order_id = hacer_pedido(db_session, cliente, pastillas, estado=OrderStatus.CANCELLED)

    detalle = client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()

    assert detalle["refunded_at"] is None
    assert detalle["refund_pending"] is True



def test_cancelar_un_pago_sin_numero_de_mercado_pago_no_lo_llama_y_queda_para_devolver_a_mano(
    client, db_session, mp, vendedor, cliente, pastillas, caplog
):
    # Ej.: pedidos de los datos de prueba, aprobados pero sin el número de pago.
    order_id = hacer_pedido(db_session, cliente, pastillas)
    pago = db_session.get(Order, order_id).payment
    pago.mp_payment_id = None
    db_session.commit()

    respuesta = cambiar(client, vendedor, order_id, "cancelled", "Se rompió la caja en el depósito.")

    assert respuesta.status_code == 200
    assert estado(db_session, order_id) == OrderStatus.CANCELLED
    assert mp.devoluciones == []
    assert f"Pedido {order_id} cancelado por el vendedor sin pago de Mercado Pago" in caplog.text
    detalle = client.get(f"{ORDERS}/seller/{order_id}", headers=vendedor).json()
    assert detalle["refund_pending"] is True
