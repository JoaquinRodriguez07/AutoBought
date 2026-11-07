"""El vendedor gestiona el estado de los pedidos (SCRUM-171).

Mercado Pago está simulado (FakeMPClient) y los mails van a la lista del
fixture `mails` (SMTP falso, ver conftest.py).
"""

from datetime import datetime, timezone

import pytest

from app.core.mercadopago import MercadoPagoUnavailable, get_mp_client
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.stock_alert import StockAlert
from backend.main import app
from order_test import auth_headers, make_client, make_part
from pago_test import FakeMPClient

ORDERS = "/api/v1/orders"


@pytest.fixture
def mp(client):
    falso = FakeMPClient()
    app.dependency_overrides[get_mp_client] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_mp_client, None)


@pytest.fixture
def seller(db_session):
    employee = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    return auth_headers(employee, "employee")


@pytest.fixture
def customer(db_session):
    return make_client(db_session)


@pytest.fixture
def pastillas(db_session):
    # Lo que quedó después de la compra de 2.
    return make_part(db_session, stock=3, price=1500)


def make_order_for(db, customer, part, qty=2, state=OrderStatus.CONFIRMED, payment_data=PaymentStatus.APPROVED):
    """Un pedido ya hecho (el stock ya se descontó). `pago=None`: un pedido
    de antes de Mercado Pago, sin Payment."""
    order = Order(
        client_id=customer.user_id, status=state,
        ship_personal_name="Ana", ship_street="Av. Italia", ship_number="1234",
        ship_city="Montevideo", ship_department="Montevideo", payment_method_label="Mercado Pago",
    )
    if payment_data is not None:
        order.payment = Payment(status=payment_data, mp_payment_id="555" if payment_data == PaymentStatus.APPROVED else None)
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.order_id, part_id=part.id, quantity=qty, frozen_price=part.price))
    db.commit()
    return order.order_id


def cambiar(client, headers, order_id, state, motivo=None):
    body = {"status": state}
    if motivo is not None:
        body["reason"] = motivo
    return client.patch(f"{ORDERS}/{order_id}/status", headers=headers, json=body)


def state(db, order_id):
    db.expire_all()
    return db.get(Order, order_id).status


def stock(db, part):
    db.expire_all()
    return db.get(Part, part.id).stock


def texto(msg):
    return msg.get_body(preferencelist=("plain",)).get_content()


# =====================================================
# Avanzar
# =====================================================


def test_avanzar_un_pedido_pagado_a_empaquetando_avisa_al_cliente(client, db_session, mp, seller, customer, pastillas, sent_mails):
    order_id = make_order_for(db_session, customer, pastillas)

    reply = cambiar(client, seller, order_id, "packing")

    assert reply.status_code == 200
    assert reply.json()["status"] == "packing"
    assert reply.json()["next_status"] == "shipped"
    assert state(db_session, order_id) == OrderStatus.PACKING
    assert [m["Subject"] for m in sent_mails] == [f"Tu pedido #{order_id} se está preparando"]
    assert sent_mails[0]["To"] == customer.email
    assert "Lo estamos empaquetando" in texto(sent_mails[0])


def test_avanza_de_a_un_paso_hasta_entregado_con_un_mail_en_cada_uno(client, db_session, mp, seller, customer, pastillas, sent_mails):
    order_id = make_order_for(db_session, customer, pastillas)

    for next_value in ("packing", "shipped", "delivered"):
        assert cambiar(client, seller, order_id, next_value).status_code == 200

    assert state(db_session, order_id) == OrderStatus.DELIVERED
    assert [m["Subject"] for m in sent_mails] == [
        f"Tu pedido #{order_id} se está preparando",
        f"Tu pedido #{order_id} fue enviado",
        f"Tu pedido #{order_id} fue entregado",
    ]
    assert stock(db_session, pastillas) == 3  # avanzar no toca el stock


@pytest.mark.parametrize(
    ("since", "hacia"),
    [
        (OrderStatus.CONFIRMED, "delivered"),
        (OrderStatus.CONFIRMED, "shipped"),
        (OrderStatus.SHIPPED, "confirmed"),  # volver, solo de a un paso
        (OrderStatus.DELIVERED, "packing"),
        (OrderStatus.CANCELLED, "shipped"),  # un cancelado no se reabre
        (OrderStatus.PACKING, "packing"),
    ],
)
def test_orden_invalido_da_409_y_el_estado_no_cambia(client, db_session, mp, seller, customer, pastillas, sent_mails, since, hacia):
    order_id = make_order_for(db_session, customer, pastillas, state=since)

    reply = cambiar(client, seller, order_id, hacia)

    assert reply.status_code == 409
    assert state(db_session, order_id) == since
    assert sent_mails == []


@pytest.mark.parametrize("payment_data", [PaymentStatus.PENDING, PaymentStatus.REJECTED])
def test_un_pedido_sin_pagar_no_se_puede_avanzar(client, db_session, mp, seller, customer, pastillas, sent_mails, payment_data):
    order_id = make_order_for(db_session, customer, pastillas, payment_data=payment_data)

    reply = cambiar(client, seller, order_id, "packing")

    assert reply.status_code == 409
    assert "todavía no está pagado" in reply.json()["detail"]
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert sent_mails == []


def test_un_pedido_de_antes_de_mercado_pago_cuenta_como_pagado(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas, payment_data=None)

    assert cambiar(client, seller, order_id, "packing").status_code == 200


# =====================================================
# Cancelar
# =====================================================


@pytest.mark.parametrize("since", [OrderStatus.CONFIRMED, OrderStatus.PACKING, OrderStatus.SHIPPED])
def test_cancelar_devuelve_el_pago_y_el_stock_y_avisa_con_el_motivo(client, db_session, mp, seller, customer, pastillas, sent_mails, since):
    order_id = make_order_for(db_session, customer, pastillas, state=since)

    reply = cambiar(client, seller, order_id, "cancelled", "  Se rompió la caja en el depósito.  ")

    assert reply.status_code == 200
    assert reply.json()["cancellation_reason"] == "Se rompió la caja en el depósito."
    assert reply.json()["can_cancel"] is False
    assert state(db_session, order_id) == OrderStatus.CANCELLED
    assert stock(db_session, pastillas) == 5
    assert mp.refunds == [("555", f"autobought-devolucion-pedido-{order_id}")]
    assert [m["Subject"] for m in sent_mails] == [f"Cancelamos tu pedido #{order_id}"]
    assert "Motivo: Se rompió la caja en el depósito." in texto(sent_mails[0])


@pytest.mark.parametrize("motivo", [None, "", "   ", "no"])
def test_cancelar_sin_motivo_da_422_y_no_cambia_nada(client, db_session, mp, seller, customer, pastillas, sent_mails, motivo):
    order_id = make_order_for(db_session, customer, pastillas)

    reply = cambiar(client, seller, order_id, "cancelled", motivo)

    assert reply.status_code == 422
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3
    assert mp.refunds == []
    assert sent_mails == []


@pytest.mark.parametrize("since", [OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_no_se_cancela_un_pedido_entregado_ni_uno_ya_cancelado(client, db_session, mp, seller, customer, pastillas, sent_mails, since):
    order_id = make_order_for(db_session, customer, pastillas, state=since)

    reply = cambiar(client, seller, order_id, "cancelled", "El cliente se arrepintió")

    assert reply.status_code == 409
    assert state(db_session, order_id) == since
    assert stock(db_session, pastillas) == 3  # el stock no vuelve dos veces
    assert mp.refunds == []
    assert sent_mails == []


def test_un_pedido_sin_pagar_no_se_cancela_a_mano(client, db_session, mp, seller, customer, pastillas, sent_mails):
    # Se cancela solo al vencer el plazo; cancelarlo antes dejaría vivo el link de pago.
    order_id = make_order_for(db_session, customer, pastillas, payment_data=PaymentStatus.PENDING)

    reply = cambiar(client, seller, order_id, "cancelled", "El cliente se arrepintió")

    assert reply.status_code == 409
    assert "se cancela solo" in reply.json()["detail"]
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3


def test_si_mercado_pago_no_devuelve_el_pago_el_pedido_no_se_cancela(client, db_session, mp, seller, customer, pastillas, sent_mails, caplog):
    order_id = make_order_for(db_session, customer, pastillas)
    mp.error = MercadoPagoUnavailable("Mercado Pago respondió con error 500")

    reply = cambiar(client, seller, order_id, "cancelled", "Sin stock real en el depósito")

    assert reply.status_code == 503
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, pastillas) == 3
    assert sent_mails == []
    assert "No se pudo devolver el pago del pedido" in caplog.text

    # Al reintentar con Mercado Pago andando, se cancela.
    mp.error = None
    assert cambiar(client, seller, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200
    assert stock(db_session, pastillas) == 5


def test_cancelar_un_pedido_de_antes_de_mercado_pago_queda_en_el_log(client, db_session, mp, seller, customer, pastillas, caplog):
    order_id = make_order_for(db_session, customer, pastillas, payment_data=None)

    assert cambiar(client, seller, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200

    assert mp.refunds == []
    assert "devolver el dinero a mano" in caplog.text


def test_cancelar_avisa_a_quienes_esperaban_un_repuesto_agotado(client, db_session, mp, seller, customer, sent_mails):
    sold_out = make_part(db_session, part_code="ACE-001", name="Aceite 10W-40", stock=0)
    order_id = make_order_for(db_session, customer, sold_out, qty=1)
    other = make_client(db_session, username="beto", email="beto@example.com")
    db_session.add(StockAlert(client_id=other.user_id, part_id=sold_out.id))
    db_session.commit()

    assert cambiar(client, seller, order_id, "cancelled", "El cliente se arrepintió").status_code == 200

    assert stock(db_session, sold_out) == 1
    asuntos = {(m["To"], m["Subject"]) for m in sent_mails}
    assert ("beto@example.com", "Volvió a haber stock de Aceite 10W-40") in asuntos
    assert (customer.email, f"Cancelamos tu pedido #{order_id}") in asuntos


def test_el_cliente_ve_el_motivo_en_su_historial(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)
    cambiar(client, seller, order_id, "cancelled", "Sin stock real en el depósito")

    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()

    assert order_data["status"] == "cancelled"
    assert order_data["cancellation_reason"] == "Sin stock real en el depósito"
    # En el historial queda como cancelado por la tienda (no como vencido).
    assert order_data["cancel_reason"] == "store"
    assert order_data["status_history"][-1]["status"] == "cancelled"


def test_cada_paso_del_vendedor_queda_en_la_linea_de_tiempo_del_cliente(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)
    cambiar(client, seller, order_id, "packing")
    cambiar(client, seller, order_id, "shipped")

    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()

    steps = [step["status"] for step in order_data["status_history"]]
    assert steps[-2:] == ["packing", "shipped"]
    assert all(step["changed_at"] for step in order_data["status_history"][-2:])


# =====================================================
# Permisos
# =====================================================


def test_solo_vendedores_pueden_cambiar_el_estado(client, db_session, mp, customer, pastillas, sent_mails):
    order_id = make_order_for(db_session, customer, pastillas)

    assert cambiar(client, auth_headers(customer), order_id, "packing").status_code == 403
    assert cambiar(client, {}, order_id, "packing").status_code == 401
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert sent_mails == []


def test_un_pedido_que_no_existe_da_404(client, mp, seller):
    assert cambiar(client, seller, 999, "packing").status_code == 404


# =====================================================
# Listado del portal
# =====================================================


def test_el_listado_filtra_por_estado_y_dice_que_se_puede_hacer(client, db_session, mp, seller, customer, pastillas):
    paid = make_order_for(db_session, customer, pastillas)
    unpaid = make_order_for(db_session, customer, pastillas, payment_data=PaymentStatus.PENDING)
    make_order_for(db_session, customer, pastillas, state=OrderStatus.PACKING)
    make_order_for(db_session, customer, pastillas, state=OrderStatus.DELIVERED)

    everyone = client.get(f"{ORDERS}/seller", headers=seller).json()
    confirmed_orders = client.get(f"{ORDERS}/seller", headers=seller, params={"status": "confirmed"}).json()

    assert everyone["total"] == 4
    assert everyone["counts"] == {"confirmed": 2, "packing": 1, "delivered": 1}
    assert everyone["to_prepare"] == 1  # el confirmado sin pagar no cuenta
    assert confirmed_orders["total"] == 2
    by_id = {o["order_id"]: o for o in confirmed_orders["orders"]}
    assert by_id[paid]["next_status"] == "packing"
    assert by_id[paid]["can_cancel"] is True
    assert by_id[paid]["client_name"] == "Ana"
    assert by_id[paid]["client_email"] == customer.email
    assert by_id[unpaid]["next_status"] is None
    assert by_id[unpaid]["can_cancel"] is False
    assert by_id[unpaid]["payment_status"] == "pending"


def test_el_listado_pagina(client, db_session, mp, seller, customer, pastillas):
    ids = [make_order_for(db_session, customer, pastillas) for _ in range(3)]

    pagina = client.get(f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "limit": 2}).json()
    resto = client.get(
        f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "limit": 2, "offset": 2}
    ).json()

    # En curso: el que lleva más esperando, primero.
    assert [o["order_id"] for o in pagina["orders"] + resto["orders"]] == ids
    assert pagina["total"] == 3


def test_el_listado_es_solo_para_vendedores(client, customer):
    assert client.get(f"{ORDERS}/seller", headers=auth_headers(customer)).status_code == 403
    assert client.get(f"{ORDERS}/seller").status_code == 401


# =====================================================
# Detalle del pedido en el portal
# =====================================================


def test_el_detalle_trae_productos_envio_cliente_y_pago(client, db_session, mp, seller, customer, pastillas):
    customer.phone = "099123456"
    db_session.commit()
    order_id = make_order_for(db_session, customer, pastillas, qty=2)

    reply = client.get(f"{ORDERS}/seller/{order_id}", headers=seller)

    assert reply.status_code == 200
    order_data = reply.json()
    assert order_data["items"] == [
        {"part_id": pastillas.id, "part_code": "BRK-001", "name": "Pastillas de freno", "quantity": 2, "frozen_price": 1500}
    ]
    assert order_data["total"] == 3000
    assert order_data["shipping_address"]["street"] == "Av. Italia"
    assert order_data["shipping_address"]["personal_name"] == "Ana"
    assert (order_data["client_name"], order_data["client_email"], order_data["client_phone"]) == ("Ana", customer.email, "099123456")
    assert (order_data["payment_status"], order_data["mp_payment_id"]) == ("approved", "555")
    assert order_data["next_status"] == "packing"
    assert order_data["can_cancel"] is True


def test_el_detalle_de_un_pedido_que_no_existe_da_404(client, seller):
    assert client.get(f"{ORDERS}/seller/999", headers=seller).status_code == 404


def test_el_detalle_es_solo_para_vendedores(client, db_session, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)

    assert client.get(f"{ORDERS}/seller/{order_id}", headers=auth_headers(customer)).status_code == 403
    assert client.get(f"{ORDERS}/seller/{order_id}").status_code == 401


def test_el_listado_puede_traer_solo_los_pagados_para_preparar(client, db_session, mp, seller, customer, pastillas):
    paid = make_order_for(db_session, customer, pastillas)
    old = make_order_for(db_session, customer, pastillas, payment_data=None)  # de antes de Mercado Pago: ya cobrado
    make_order_for(db_session, customer, pastillas, payment_data=PaymentStatus.PENDING)
    make_order_for(db_session, customer, pastillas, payment_data=PaymentStatus.REJECTED)

    reply = client.get(
        f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "paid_only": "true"}
    ).json()

    assert [o["order_id"] for o in reply["orders"]] == [paid, old]
    assert reply["total"] == 2 == reply["to_prepare"]


def test_el_listado_se_ordena_por_fecha_cliente_o_total(client, db_session, mp, seller, pastillas):
    bruno = make_client(db_session, username="bruno", email="bruno@example.com")
    bruno.name = "bruno Díaz"  # en minúscula: el orden no distingue mayúsculas
    carla = make_client(db_session, username="carla", email="carla@example.com")
    carla.name = "Carla Pérez"
    ana = make_client(db_session, username="ana2", email="ana2@example.com")  # se llama "Ana"
    db_session.commit()
    # Total: 1 × 1500, 3 × 1500 y 2 × 1500.
    de_bruno = make_order_for(db_session, bruno, pastillas, qty=1)
    de_carla = make_order_for(db_session, carla, pastillas, qty=3)
    de_ana = make_order_for(db_session, ana, pastillas, qty=2)
    for order_id, day_number in ((de_bruno, 3), (de_carla, 1), (de_ana, 2)):
        db_session.get(Order, order_id).created_at = datetime(2026, 11, day_number, tzinfo=timezone.utc)
    db_session.commit()

    def ids(ordering):
        reply = client.get(f"{ORDERS}/seller", headers=seller, params={"sort": ordering})
        assert reply.status_code == 200
        return [o["order_id"] for o in reply.json()["orders"]]

    assert ids("newest") == [de_bruno, de_ana, de_carla]
    assert ids("oldest") == [de_carla, de_ana, de_bruno]
    assert ids("client_asc") == [de_ana, de_bruno, de_carla]
    assert ids("client_desc") == [de_carla, de_bruno, de_ana]
    assert ids("total_desc") == [de_carla, de_ana, de_bruno]
    assert ids("total_asc") == [de_bruno, de_ana, de_carla]
    # Sin `sort`, como siempre: con el filtro de un estado en curso, el que más espera primero.
    unordered = client.get(f"{ORDERS}/seller", headers=seller, params={"status": "confirmed"}).json()
    assert [o["order_id"] for o in unordered["orders"]] == [de_carla, de_ana, de_bruno]


def test_un_orden_que_no_existe_da_422(client, seller):
    assert client.get(f"{ORDERS}/seller", headers=seller, params={"sort": "precio"}).status_code == 422


# =====================================================
# Volver un paso atrás
# =====================================================


@pytest.mark.parametrize(
    ("since", "hacia"),
    [
        (OrderStatus.PACKING, OrderStatus.CONFIRMED),
        (OrderStatus.SHIPPED, OrderStatus.PACKING),
        (OrderStatus.DELIVERED, OrderStatus.SHIPPED),
    ],
)
def test_volver_un_paso_atras_corrige_sin_mandar_mail(client, db_session, mp, seller, customer, pastillas, sent_mails, since, hacia):
    order_id = make_order_for(db_session, customer, pastillas, state=since)
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["previous_status"] == hacia.value

    reply = cambiar(client, seller, order_id, hacia.value)

    assert reply.status_code == 200
    assert reply.json()["status"] == hacia.value
    assert state(db_session, order_id) == hacia
    assert stock(db_session, pastillas) == 3  # el stock no se toca
    assert sent_mails == []


def test_no_hay_a_donde_volver_si_esta_confirmado_cancelado_o_sin_pagar(client, db_session, mp, seller, customer, pastillas):
    confirmed = make_order_for(db_session, customer, pastillas)
    cancelled = make_order_for(db_session, customer, pastillas, state=OrderStatus.CANCELLED)
    unpaid = make_order_for(db_session, customer, pastillas, state=OrderStatus.PACKING, payment_data=PaymentStatus.PENDING)

    for order_id in (confirmed, cancelled, unpaid):
        assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["previous_status"] is None
    assert cambiar(client, seller, unpaid, "confirmed").status_code == 409


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


@pytest.mark.parametrize("since", [OrderStatus.CONFIRMED, OrderStatus.PACKING])
def test_el_vendedor_corrige_la_direccion_mientras_no_se_envio(client, db_session, mp, seller, customer, pastillas, sent_mails, since):
    order_id = make_order_for(db_session, customer, pastillas, state=since)

    reply = editar(client, seller, order_id, {"shipping_address": DIRECCION_NUEVA})

    assert reply.status_code == 200
    assert reply.json()["shipping_address"] == DIRECCION_NUEVA
    assert reply.json()["can_edit_shipping"] is True
    # El cliente ve la dirección corregida en su historial.
    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()
    assert order_data["shipping_address"]["street"] == "Bv. Artigas"
    assert state(db_session, order_id) == since
    assert sent_mails == []


@pytest.mark.parametrize("since", [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_la_direccion_no_se_cambia_si_el_pedido_ya_salio(client, db_session, mp, seller, customer, pastillas, since):
    order_id = make_order_for(db_session, customer, pastillas, state=since)

    reply = editar(client, seller, order_id, {"shipping_address": DIRECCION_NUEVA})

    assert reply.status_code == 409
    db_session.expire_all()
    assert db_session.get(Order, order_id).ship_street == "Av. Italia"
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["can_edit_shipping"] is False


@pytest.mark.parametrize(
    "cambio",
    [
        {"street": ""},
        {"department": "Atlántida"},
        {"city": "Salto", "department": "Montevideo"},  # una ciudad que es otro departamento
    ],
)
def test_una_direccion_invalida_da_422(client, db_session, mp, seller, customer, pastillas, cambio):
    order_id = make_order_for(db_session, customer, pastillas)

    reply = editar(client, seller, order_id, {"shipping_address": {**DIRECCION_NUEVA, **cambio}})

    assert reply.status_code == 422
    db_session.expire_all()
    assert db_session.get(Order, order_id).ship_street == "Av. Italia"


def test_la_nota_interna_se_guarda_y_el_cliente_no_la_ve(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas, state=OrderStatus.DELIVERED)

    reply = editar(client, seller, order_id, {"internal_note": "  Pidió que se entregue de tarde.  "})

    assert reply.status_code == 200
    assert reply.json()["internal_note"] == "Pidió que se entregue de tarde."
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["internal_note"] == "Pidió que se entregue de tarde."
    historial = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()
    assert "internal_note" not in historial
    assert "Pidió que se entregue" not in str(client.get(ORDERS, headers=auth_headers(customer)).json())

    # Vacía, se borra.
    assert editar(client, seller, order_id, {"internal_note": "   "}).json()["internal_note"] is None


def test_editar_sin_nada_o_borrando_la_direccion_da_422(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)

    assert editar(client, seller, order_id, {}).status_code == 422
    assert editar(client, seller, order_id, {"shipping_address": None}).status_code == 422
    assert editar(client, seller, order_id, {"internal_note": "x" * 501}).status_code == 422


def test_editar_es_solo_para_vendedores_y_de_pedidos_que_existen(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)

    assert editar(client, auth_headers(customer), order_id, {"internal_note": "hola"}).status_code == 403
    assert editar(client, {}, order_id, {"internal_note": "hola"}).status_code == 401
    assert editar(client, seller, 999, {"internal_note": "hola"}).status_code == 404



# =====================================================
# Devolución del pago
# =====================================================


def test_cancelar_anota_cuando_se_devolvio_el_pago(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas)

    cambiar(client, seller, order_id, "cancelled", "Se rompió la caja en el depósito.")

    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()
    assert detail["refunded_at"] is not None
    assert detail["refund_pending"] is False


def test_el_detalle_avisa_si_falta_devolver_el_pago(client, db_session, mp, seller, customer, pastillas):
    order_id = make_order_for(db_session, customer, pastillas, state=OrderStatus.CANCELLED)

    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()

    assert detail["refunded_at"] is None
    assert detail["refund_pending"] is True



def test_cancelar_un_pago_sin_numero_de_mercado_pago_no_lo_llama_y_queda_para_devolver_a_mano(
    client, db_session, mp, seller, customer, pastillas, caplog
):
    # Ej.: pedidos de los datos de prueba, aprobados pero sin el número de pago.
    order_id = make_order_for(db_session, customer, pastillas)
    payment_data = db_session.get(Order, order_id).payment
    payment_data.mp_payment_id = None
    db_session.commit()

    reply = cambiar(client, seller, order_id, "cancelled", "Se rompió la caja en el depósito.")

    assert reply.status_code == 200
    assert state(db_session, order_id) == OrderStatus.CANCELLED
    assert mp.refunds == []
    assert f"Pedido {order_id} cancelado por el vendedor sin pago de Mercado Pago" in caplog.text
    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()
    assert detail["refund_pending"] is True
