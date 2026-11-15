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
from payment_test import FakeMPClient

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
def brake_pads(db_session):
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


def change_order_status(client, headers, order_id, state, motivo=None):
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


def test_advance_a_order_paid_a_packing_notifies_to_the_customer(client, db_session, mp, seller, customer, brake_pads, sent_mails):
    order_id = make_order_for(db_session, customer, brake_pads)

    reply = change_order_status(client, seller, order_id, "packing")

    assert reply.status_code == 200
    assert reply.json()["status"] == "packing"
    assert reply.json()["next_status"] == "shipped"
    assert state(db_session, order_id) == OrderStatus.PACKING
    assert [m["Subject"] for m in sent_mails] == [f"Tu pedido #{order_id} se está preparando"]
    assert sent_mails[0]["To"] == customer.email
    assert "Lo estamos empaquetando" in texto(sent_mails[0])


def test_advances_of_a_step_until_delivered_with_a_mail_in_each_one(client, db_session, mp, seller, customer, brake_pads, sent_mails):
    order_id = make_order_for(db_session, customer, brake_pads)

    for next_value in ("packing", "shipped", "delivered"):
        assert change_order_status(client, seller, order_id, next_value).status_code == 200

    assert state(db_session, order_id) == OrderStatus.DELIVERED
    assert [m["Subject"] for m in sent_mails] == [
        f"Tu pedido #{order_id} se está preparando",
        f"Tu pedido #{order_id} fue enviado",
        f"Tu pedido #{order_id} fue entregado",
    ]
    assert stock(db_session, brake_pads) == 3  # avanzar no toca el stock


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
def test_order_invalid_gives_409_and_the_status_no_changes(client, db_session, mp, seller, customer, brake_pads, sent_mails, since, hacia):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)

    reply = change_order_status(client, seller, order_id, hacia)

    assert reply.status_code == 409
    assert state(db_session, order_id) == since
    assert sent_mails == []


@pytest.mark.parametrize("payment_data", [PaymentStatus.PENDING, PaymentStatus.REJECTED])
def test_a_order_without_pay_no_can_advance(client, db_session, mp, seller, customer, brake_pads, sent_mails, payment_data):
    order_id = make_order_for(db_session, customer, brake_pads, payment_data=payment_data)

    reply = change_order_status(client, seller, order_id, "packing")

    assert reply.status_code == 409
    assert "todavía no está pagado" in reply.json()["detail"]
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert sent_mails == []


def test_a_order_of_before_of_mercado_payment_account_as_paid(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads, payment_data=None)

    assert change_order_status(client, seller, order_id, "packing").status_code == 200


# =====================================================
# Cancelar
# =====================================================


@pytest.mark.parametrize("since", [OrderStatus.CONFIRMED, OrderStatus.PACKING, OrderStatus.SHIPPED])
def test_cancel_returns_the_payment_and_the_stock_and_notifies_with_the_reason(client, db_session, mp, seller, customer, brake_pads, sent_mails, since):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)

    reply = change_order_status(client, seller, order_id, "cancelled", "  Se rompió la caja en el depósito.  ")

    assert reply.status_code == 200
    assert reply.json()["cancellation_reason"] == "Se rompió la caja en el depósito."
    assert reply.json()["can_cancel"] is False
    assert state(db_session, order_id) == OrderStatus.CANCELLED
    assert stock(db_session, brake_pads) == 5
    assert mp.refunds == [("555", f"autobought-devolucion-pedido-{order_id}")]
    assert [m["Subject"] for m in sent_mails] == [f"Cancelamos tu pedido #{order_id}"]
    assert "Motivo: Se rompió la caja en el depósito." in texto(sent_mails[0])


@pytest.mark.parametrize("motivo", [None, "", "   ", "no"])
def test_cancel_without_reason_gives_422_and_no_changes_nothing(client, db_session, mp, seller, customer, brake_pads, sent_mails, motivo):
    order_id = make_order_for(db_session, customer, brake_pads)

    reply = change_order_status(client, seller, order_id, "cancelled", motivo)

    assert reply.status_code == 422
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, brake_pads) == 3
    assert mp.refunds == []
    assert sent_mails == []


@pytest.mark.parametrize("since", [OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_no_cancels_a_order_delivered_nor_one_already_cancelled(client, db_session, mp, seller, customer, brake_pads, sent_mails, since):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)

    reply = change_order_status(client, seller, order_id, "cancelled", "El cliente se arrepintió")

    assert reply.status_code == 409
    assert state(db_session, order_id) == since
    assert stock(db_session, brake_pads) == 3  # el stock no vuelve dos veces
    assert mp.refunds == []
    assert sent_mails == []


def test_a_order_without_pay_no_cancels_a_hand(client, db_session, mp, seller, customer, brake_pads, sent_mails):
    # Se cancela solo al vencer el plazo; cancelarlo antes dejaría vivo el link de pago.
    order_id = make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.PENDING)

    reply = change_order_status(client, seller, order_id, "cancelled", "El cliente se arrepintió")

    assert reply.status_code == 409
    assert "se cancela solo" in reply.json()["detail"]
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, brake_pads) == 3


def test_if_mercado_payment_no_returns_the_payment_the_order_no_cancels(client, db_session, mp, seller, customer, brake_pads, sent_mails, caplog):
    order_id = make_order_for(db_session, customer, brake_pads)
    mp.error = MercadoPagoUnavailable("Mercado Pago respondió con error 500")

    reply = change_order_status(client, seller, order_id, "cancelled", "Sin stock real en el depósito")

    assert reply.status_code == 503
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert stock(db_session, brake_pads) == 3
    assert sent_mails == []
    assert "No se pudo devolver el pago del pedido" in caplog.text

    # Al reintentar con Mercado Pago andando, se cancela.
    mp.error = None
    assert change_order_status(client, seller, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200
    assert stock(db_session, brake_pads) == 5


def test_cancel_a_order_of_before_of_mercado_payment_stays_in_the_log(client, db_session, mp, seller, customer, brake_pads, caplog):
    order_id = make_order_for(db_session, customer, brake_pads, payment_data=None)

    assert change_order_status(client, seller, order_id, "cancelled", "Sin stock real en el depósito").status_code == 200

    assert mp.refunds == []
    assert "devolver el dinero a mano" in caplog.text


def test_cancel_notifies_a_those_who_were_waiting_a_part_sold_out(client, db_session, mp, seller, customer, sent_mails):
    sold_out = make_part(db_session, part_code="ACE-001", name="Aceite 10W-40", stock=0)
    order_id = make_order_for(db_session, customer, sold_out, qty=1)
    other = make_client(db_session, username="beto", email="beto@example.com")
    db_session.add(StockAlert(client_id=other.user_id, part_id=sold_out.id))
    db_session.commit()

    assert change_order_status(client, seller, order_id, "cancelled", "El cliente se arrepintió").status_code == 200

    assert stock(db_session, sold_out) == 1
    asuntos = {(m["To"], m["Subject"]) for m in sent_mails}
    assert ("beto@example.com", "Volvió a haber stock de Aceite 10W-40") in asuntos
    assert (customer.email, f"Cancelamos tu pedido #{order_id}") in asuntos


def test_the_customer_sees_the_reason_in_its_history(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)
    change_order_status(client, seller, order_id, "cancelled", "Sin stock real en el depósito")

    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()

    assert order_data["status"] == "cancelled"
    assert order_data["cancellation_reason"] == "Sin stock real en el depósito"
    # En el historial queda como cancelado por la tienda (no como vencido).
    assert order_data["cancel_reason"] == "store"
    assert order_data["status_history"][-1]["status"] == "cancelled"


def test_each_step_of_the_seller_stays_in_the_line_of_time_of_the_customer(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)
    change_order_status(client, seller, order_id, "packing")
    change_order_status(client, seller, order_id, "shipped")

    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()

    steps = [step["status"] for step in order_data["status_history"]]
    assert steps[-2:] == ["packing", "shipped"]
    assert all(step["changed_at"] for step in order_data["status_history"][-2:])


# =====================================================
# Permisos
# =====================================================


def test_only_sellers_can_change_the_status(client, db_session, mp, customer, brake_pads, sent_mails):
    order_id = make_order_for(db_session, customer, brake_pads)

    assert change_order_status(client, auth_headers(customer), order_id, "packing").status_code == 403
    assert change_order_status(client, {}, order_id, "packing").status_code == 401
    assert state(db_session, order_id) == OrderStatus.CONFIRMED
    assert sent_mails == []


def test_a_order_that_no_exists_gives_404(client, mp, seller):
    assert change_order_status(client, seller, 999, "packing").status_code == 404


# =====================================================
# Listado del portal
# =====================================================


def test_the_listing_filters_by_status_and_says_that_can_make(client, db_session, mp, seller, customer, brake_pads):
    paid = make_order_for(db_session, customer, brake_pads)
    unpaid = make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.PENDING)
    make_order_for(db_session, customer, brake_pads, state=OrderStatus.PACKING)
    make_order_for(db_session, customer, brake_pads, state=OrderStatus.DELIVERED)

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


def test_the_listing_page(client, db_session, mp, seller, customer, brake_pads):
    ids = [make_order_for(db_session, customer, brake_pads) for _ in range(3)]

    pagina = client.get(f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "limit": 2}).json()
    resto = client.get(
        f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "limit": 2, "offset": 2}
    ).json()

    # En curso: el que lleva más esperando, primero.
    assert [o["order_id"] for o in pagina["orders"] + resto["orders"]] == ids
    assert pagina["total"] == 3


def test_the_listing_is_only_for_sellers(client, customer):
    assert client.get(f"{ORDERS}/seller", headers=auth_headers(customer)).status_code == 403
    assert client.get(f"{ORDERS}/seller").status_code == 401


# =====================================================
# Detalle del pedido en el portal
# =====================================================


def test_the_detail_brings_products_shipping_customer_and_payment(client, db_session, mp, seller, customer, brake_pads):
    customer.phone = "099123456"
    db_session.commit()
    order_id = make_order_for(db_session, customer, brake_pads, qty=2)

    reply = client.get(f"{ORDERS}/seller/{order_id}", headers=seller)

    assert reply.status_code == 200
    order_data = reply.json()
    assert order_data["items"] == [
        {"part_id": brake_pads.id, "part_code": "BRK-001", "name": "Pastillas de freno", "quantity": 2, "frozen_price": 1500}
    ]
    assert order_data["total"] == 3000
    assert order_data["shipping_address"]["street"] == "Av. Italia"
    assert order_data["shipping_address"]["personal_name"] == "Ana"
    assert (order_data["client_name"], order_data["client_email"], order_data["client_phone"]) == ("Ana", customer.email, "099123456")
    assert (order_data["payment_status"], order_data["mp_payment_id"]) == ("approved", "555")
    assert order_data["next_status"] == "packing"
    assert order_data["can_cancel"] is True


def test_the_detail_of_a_order_that_no_exists_gives_404(client, seller):
    assert client.get(f"{ORDERS}/seller/999", headers=seller).status_code == 404


def test_the_detail_is_only_for_sellers(client, db_session, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)

    assert client.get(f"{ORDERS}/seller/{order_id}", headers=auth_headers(customer)).status_code == 403
    assert client.get(f"{ORDERS}/seller/{order_id}").status_code == 401


def test_the_listing_can_bring_only_the_paid_for_prepare(client, db_session, mp, seller, customer, brake_pads):
    paid = make_order_for(db_session, customer, brake_pads)
    old = make_order_for(db_session, customer, brake_pads, payment_data=None)  # de antes de Mercado Pago: ya cobrado
    make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.PENDING)
    make_order_for(db_session, customer, brake_pads, payment_data=PaymentStatus.REJECTED)

    reply = client.get(
        f"{ORDERS}/seller", headers=seller, params={"status": "confirmed", "paid_only": "true"}
    ).json()

    assert [o["order_id"] for o in reply["orders"]] == [paid, old]
    assert reply["total"] == 2 == reply["to_prepare"]


def test_the_listing_sorts_by_date_customer_or_total(client, db_session, mp, seller, brake_pads):
    bruno = make_client(db_session, username="bruno", email="bruno@example.com")
    bruno.name = "bruno Díaz"  # en minúscula: el orden no distingue mayúsculas
    carla = make_client(db_session, username="carla", email="carla@example.com")
    carla.name = "Carla Pérez"
    ana = make_client(db_session, username="ana2", email="ana2@example.com")  # se llama "Ana"
    db_session.commit()
    # Total: 1 × 1500, 3 × 1500 y 2 × 1500.
    de_bruno = make_order_for(db_session, bruno, brake_pads, qty=1)
    de_carla = make_order_for(db_session, carla, brake_pads, qty=3)
    de_ana = make_order_for(db_session, ana, brake_pads, qty=2)
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


def test_a_order_that_no_exists_gives_422(client, seller):
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
def test_go_back_a_step_back_fixes_without_send_mail(client, db_session, mp, seller, customer, brake_pads, sent_mails, since, hacia):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["previous_status"] == hacia.value

    reply = change_order_status(client, seller, order_id, hacia.value)

    assert reply.status_code == 200
    assert reply.json()["status"] == hacia.value
    assert state(db_session, order_id) == hacia
    assert stock(db_session, brake_pads) == 3  # el stock no se toca
    assert sent_mails == []


def test_no_there_is_a_where_go_back_if_is_confirmed_cancelled_or_without_pay(client, db_session, mp, seller, customer, brake_pads):
    confirmed = make_order_for(db_session, customer, brake_pads)
    cancelled = make_order_for(db_session, customer, brake_pads, state=OrderStatus.CANCELLED)
    unpaid = make_order_for(db_session, customer, brake_pads, state=OrderStatus.PACKING, payment_data=PaymentStatus.PENDING)

    for order_id in (confirmed, cancelled, unpaid):
        assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["previous_status"] is None
    assert change_order_status(client, seller, unpaid, "confirmed").status_code == 409


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


def edit_order(client, headers, order_id, body):
    return client.patch(f"{ORDERS}/seller/{order_id}", headers=headers, json=body)


@pytest.mark.parametrize("since", [OrderStatus.CONFIRMED, OrderStatus.PACKING])
def test_the_seller_fixes_the_address_while_no_shipping(client, db_session, mp, seller, customer, brake_pads, sent_mails, since):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)

    reply = edit_order(client, seller, order_id, {"shipping_address": DIRECCION_NUEVA})

    assert reply.status_code == 200
    assert reply.json()["shipping_address"] == DIRECCION_NUEVA
    assert reply.json()["can_edit_shipping"] is True
    # El cliente ve la dirección corregida en su historial.
    order_data = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()
    assert order_data["shipping_address"]["street"] == "Bv. Artigas"
    assert state(db_session, order_id) == since
    assert sent_mails == []


@pytest.mark.parametrize("since", [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
def test_the_address_no_changes_if_the_order_already_went_out(client, db_session, mp, seller, customer, brake_pads, since):
    order_id = make_order_for(db_session, customer, brake_pads, state=since)

    reply = edit_order(client, seller, order_id, {"shipping_address": DIRECCION_NUEVA})

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
def test_a_address_invalid_gives_422(client, db_session, mp, seller, customer, brake_pads, cambio):
    order_id = make_order_for(db_session, customer, brake_pads)

    reply = edit_order(client, seller, order_id, {"shipping_address": {**DIRECCION_NUEVA, **cambio}})

    assert reply.status_code == 422
    db_session.expire_all()
    assert db_session.get(Order, order_id).ship_street == "Av. Italia"


def test_the_note_internal_saves_and_the_customer_no_the_sees(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads, state=OrderStatus.DELIVERED)

    reply = edit_order(client, seller, order_id, {"internal_note": "  Pidió que se entregue de tarde.  "})

    assert reply.status_code == 200
    assert reply.json()["internal_note"] == "Pidió que se entregue de tarde."
    assert client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()["internal_note"] == "Pidió que se entregue de tarde."
    historial = client.get(f"{ORDERS}/{order_id}", headers=auth_headers(customer)).json()
    assert "internal_note" not in historial
    assert "Pidió que se entregue" not in str(client.get(ORDERS, headers=auth_headers(customer)).json())

    # Vacía, se borra.
    assert edit_order(client, seller, order_id, {"internal_note": "   "}).json()["internal_note"] is None


def test_edit_without_nothing_or_clearing_the_address_gives_422(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)

    assert edit_order(client, seller, order_id, {}).status_code == 422
    assert edit_order(client, seller, order_id, {"shipping_address": None}).status_code == 422
    assert edit_order(client, seller, order_id, {"internal_note": "x" * 501}).status_code == 422


def test_edit_is_only_for_sellers_and_of_orders_that_exist(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)

    assert edit_order(client, auth_headers(customer), order_id, {"internal_note": "hola"}).status_code == 403
    assert edit_order(client, {}, order_id, {"internal_note": "hola"}).status_code == 401
    assert edit_order(client, seller, 999, {"internal_note": "hola"}).status_code == 404



# =====================================================
# Devolución del pago
# =====================================================


def test_cancel_records_when_refunded_the_payment(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads)

    change_order_status(client, seller, order_id, "cancelled", "Se rompió la caja en el depósito.")

    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()
    assert detail["refunded_at"] is not None
    assert detail["refund_pending"] is False


def test_the_detail_notifies_if_missing_refund_the_payment(client, db_session, mp, seller, customer, brake_pads):
    order_id = make_order_for(db_session, customer, brake_pads, state=OrderStatus.CANCELLED)

    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()

    assert detail["refunded_at"] is None
    assert detail["refund_pending"] is True



def test_cancel_a_payment_without_number_of_mercado_payment_no_it_calls_and_stays_for_refund_a_hand(
    client, db_session, mp, seller, customer, brake_pads, caplog
):
    # Ej.: pedidos de los datos de prueba, aprobados pero sin el número de pago.
    order_id = make_order_for(db_session, customer, brake_pads)
    payment_data = db_session.get(Order, order_id).payment
    payment_data.mp_payment_id = None
    db_session.commit()

    reply = change_order_status(client, seller, order_id, "cancelled", "Se rompió la caja en el depósito.")

    assert reply.status_code == 200
    assert state(db_session, order_id) == OrderStatus.CANCELLED
    assert mp.refunds == []
    assert f"Pedido {order_id} cancelado por el vendedor sin pago de Mercado Pago" in caplog.text
    detail = client.get(f"{ORDERS}/seller/{order_id}", headers=seller).json()
    assert detail["refund_pending"] is True
