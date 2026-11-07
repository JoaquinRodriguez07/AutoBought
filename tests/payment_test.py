"""Pago de los pedidos con Mercado Pago. Mercado Pago está simulado: el CI
nunca lo llama."""

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.core.mercadopago import (
    MercadoPagoHTTPClient,
    MercadoPagoUnavailable,
    MPPayment,
    valid_signature,
    get_mp_client,
)
from app.core.security import hash_password
from app.crud import payment as crud_payment
from app.crud import user as crud_user
from app.crud.order import cancel_expired_orders
from app.models.cart_item import CartItem
from app.models.order import Order, OrderStatus
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from backend.main import app
from order_test import auth_headers, make_address, make_cart, make_client, make_part


class FakeMPClient:
    def __init__(self):
        self.preferencias: list[dict] = []
        # Lo que "responde" Mercado Pago al consultar cada pago.
        self.payments: dict[str, MPPayment] = {}
        self.error: Exception | None = None
        self.queried: list[str] = []
        # (id del pago, clave de idempotencia) de cada devolución pedida.
        self.refunds: list[tuple[str, str]] = []

    def refund_payment(self, payment_id_value: str, idempotency_key: str) -> None:
        if self.error:
            raise self.error
        self.refunds.append((payment_id_value, idempotency_key))

    def create_preference(self, preference: dict) -> tuple[str, str]:
        if self.error:
            raise self.error
        self.preferencias.append(preference)
        number_value = len(self.preferencias)
        return f"pref-{number_value}", f"https://mercadopago.test/checkout/pref-{number_value}"

    def get_payment(self, payment_id_value: str) -> MPPayment:
        if self.error:
            raise self.error
        return self.payments[payment_id_value]

    def get_preference(self, preference_id: str) -> str:
        if self.error:
            raise self.error
        self.queried.append(preference_id)
        return f"https://mercadopago.test/checkout/{preference_id}"


@pytest.fixture
def mp(client):
    falso = FakeMPClient()
    app.dependency_overrides[get_mp_client] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_mp_client, None)


@pytest.fixture
def order_data(client, db_session):
    """Un pedido recién confirmado (pago pendiente) y los headers de su cliente."""
    customer = make_client(db_session)
    make_address(db_session, customer)
    brake_pads = make_part(db_session, stock=5, price=1500)
    make_cart(db_session, customer, [(brake_pads, 2)])
    headers = auth_headers(customer)
    order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]
    return order_id, headers


def verify_payment(client, order_id, headers, payment_id="999"):
    """Lo que hace la tienda al volver de Mercado Pago con ?payment_id=..."""
    return client.post(f"/api/v1/pagos/{order_id}/verificar", headers=headers, json={"payment_id": payment_id})


def notify_payment(client, payment_id_value="999", tipo="payment"):
    """El aviso (webhook) que manda Mercado Pago cuando cambia un pago."""
    return client.post(
        f"/api/v1/pagos/webhook?data.id={payment_id_value}&type={tipo}",
        json={"action": "payment.updated", "type": tipo, "data": {"id": payment_id_value}},
    )


def payment_state(db_session, order_id):
    db_session.expire_all()
    return db_session.query(Payment).filter_by(order_id=order_id).one().status


# =====================================================
# POST /api/v1/pagos/{order_id}: link de pago
# =====================================================


def test_creates_the_link_of_payment_with_the_items_and_the_number_of_order(client, db_session, mp, order_data):
    order_id, headers = order_data

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"url": "https://mercadopago.test/checkout/pref-1"}
    preference = mp.preferencias[0]
    assert preference["external_reference"] == str(order_id)
    assert preference["items"] == [
        {"id": preference["items"][0]["id"], "title": "Pastillas de freno",
         "quantity": 2, "unit_price": 1500, "currency_id": "UYU"},
    ]
    assert preference["back_urls"]["failure"].endswith(f"/pago?pedido={order_id}")
    assert db_session.query(Payment).one().mp_preference_id == "pref-1"


def test_the_link_of_a_order_foreign_gives_404(client, db_session, mp, order_data):
    order_id, _ = order_data
    other = make_client(db_session, username="beto", email="beto@example.com")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=auth_headers(other))

    assert response.status_code == 404
    assert mp.preferencias == []


def test_a_order_paid_no_gives_another_link(client, db_session, mp, order_data):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)
    notify_payment(client)

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 409


def test_if_mercado_payment_no_answers_the_link_gives_503_and_it_records(client, db_session, mp, order_data, caplog):
    order_id, headers = order_data
    mp.error = MercadoPagoUnavailable("No hay token de Mercado Pago configurado.")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 503
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING
    # El motivo real queda en el log del backend.
    assert f"No se pudo crear el link de pago del pedido {order_id}: No hay token" in caplog.text


def test_pay_of_new_with_the_payment_pending_opens_the_same_link(client, db_session, mp, order_data):
    order_id, headers = order_data
    first = client.post(f"/api/v1/pagos/{order_id}", headers=headers).json()

    segundo = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert segundo.status_code == 200
    assert segundo.json() == first
    # No se creó otra preferencia: se pidió el link de la que ya había.
    assert len(mp.preferencias) == 1
    assert mp.queried == ["pref-1"]
    assert db_session.query(Payment).one().mp_preference_id == "pref-1"


def test_pay_of_new_after_of_a_rejection_creates_a_link_new(client, db_session, mp, order_data):
    order_id, headers = order_data
    client.post(f"/api/v1/pagos/{order_id}", headers=headers)
    mp.payments["998"] = MPPayment(id="998", state="rejected", reference=str(order_id))
    notify_payment(client, "998")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.json() == {"url": "https://mercadopago.test/checkout/pref-2"}
    assert len(mp.preferencias) == 2
    assert mp.queried == []


def test_if_mercado_payment_no_returns_the_link_current_gives_503(client, db_session, mp, order_data, caplog):
    order_id, headers = order_data
    client.post(f"/api/v1/pagos/{order_id}", headers=headers)
    mp.error = MercadoPagoUnavailable("Mercado Pago no respondió: ConnectTimeout.")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 503
    assert f"No se pudo crear el link de pago del pedido {order_id}" in caplog.text


# =====================================================
# POST /orders sin Mercado Pago configurado
# =====================================================


def test_without_token_of_mercado_payment_no_creates_the_order(client, db_session, monkeypatch):
    monkeypatch.setattr("app.core.config.MERCADOPAGO_ACCESS_TOKEN", "")
    customer = make_client(db_session)
    make_address(db_session, customer)
    brake_pads = make_part(db_session, stock=5, price=1500)
    make_cart(db_session, customer, [(brake_pads, 2)])

    response = client.post("/api/v1/orders", headers=auth_headers(customer))

    assert response.status_code == 503
    assert "carrito quedó igual" in response.json()["detail"]
    db_session.expire_all()
    assert db_session.query(Order).count() == 0
    assert db_session.query(Part).one().stock == 5
    assert db_session.query(CartItem).one().amount == 2


# =====================================================
# POST /api/v1/pagos/webhook: avisos de Mercado Pago
# =====================================================


def test_notice_of_payment_approved_brand_the_order_paid_and_sends_the_mail(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    response = notify_payment(client)

    assert response.status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED
    assert db_session.query(Payment).one().mp_payment_id == "999"
    assert client.get(f"/api/v1/orders/{order_id}", headers=headers).json()["payment_status"] == "approved"

    assert len(sent_mails) == 1
    assert sent_mails[0]["Subject"] == f"Confirmamos tu pedido #{order_id}"
    texto = sent_mails[0].get_body(preferencelist=("plain",)).get_content()
    assert "2 x Pastillas de freno: $ 3.000" in texto
    assert "Mercado Pago" in texto


def test_notice_of_payment_rejected_leaves_the_order_without_pay_and_with_stock_reserved(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    mp.payments["998"] = MPPayment(id="998", state="rejected", reference=str(order_id))

    response = notify_payment(client, "998")

    assert response.status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.REJECTED
    assert sent_mails == []
    # El stock queda reservado para reintentar.
    assert db_session.query(Part).one().stock == 3
    # Y se puede reintentar con un link nuevo.
    assert client.post(f"/api/v1/pagos/{order_id}", headers=headers).status_code == 200


def test_a_link_new_after_of_a_rejection_leaves_the_payment_pending(client, db_session, mp, order_data):
    order_id, headers = order_data
    mp.payments["998"] = MPPayment(id="998", state="rejected", reference=str(order_id))
    notify_payment(client, "998")

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    # Si al volver de pagar bien el aviso todavía no llegó, no se muestra el
    # rechazo viejo (y el cliente no paga dos veces).
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


def test_retry_after_of_a_rejection_and_approve(client, db_session, mp, order_data):
    order_id, _ = order_data
    mp.payments["998"] = MPPayment(id="998", state="rejected", reference=str(order_id))
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    notify_payment(client, "998")
    notify_payment(client, "999")

    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED


@pytest.mark.parametrize("charged_amount", [1500, 3000.5, None])
def test_a_payment_approved_by_another_amount_stays_rejected_and_in_the_log(
    client, db_session, mp, order_data, sent_mails, caplog, charged_amount
):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=charged_amount)

    response = notify_payment(client)

    assert response.status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.REJECTED
    assert sent_mails == []
    assert f"El pago 999 del pedido {order_id} se aprobó por {charged_amount}, pero el pedido cuesta 3000" in caplog.text


def test_verify_a_payment_by_another_amount_no_it_gives_by_paid(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=1)

    response = verify_payment(client, order_id, headers)

    assert response.json() == {"estado": "rejected"}
    assert sent_mails == []


def test_a_notice_repetido_no_processes_two_times(client, db_session, mp, order_data, sent_mails):
    order_id, _ = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)
    mp.payments["998"] = MPPayment(id="998", state="rejected", reference=str(order_id))

    notify_payment(client)
    notify_payment(client)
    # Un rechazo que llega tarde no deshace el pago aprobado.
    notify_payment(client, "998")

    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED
    assert db_session.query(Payment).one().mp_payment_id == "999"
    assert len(sent_mails) == 1


def test_a_payment_in_process_leaves_the_order_pending(client, db_session, mp, order_data):
    order_id, _ = order_data
    mp.payments["999"] = MPPayment(id="999", state="in_process", reference=str(order_id))

    assert notify_payment(client).status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


def test_the_status_goes_out_of_query_a_mercado_payment_no_of_the_notice(client, db_session, mp, order_data):
    order_id, _ = order_data
    mp.payments["999"] = MPPayment(id="999", state="rejected", reference=str(order_id))

    # Aunque el aviso diga "approved", Mercado Pago responde "rejected".
    client.post(
        "/api/v1/pagos/webhook?data.id=999&type=payment",
        json={"type": "payment", "data": {"id": "999"}, "status": "approved"},
    )

    assert payment_state(db_session, order_id) == PaymentStatus.REJECTED


def test_notices_that_no_are_of_payments_or_of_another_order_ignore(client, db_session, mp, order_data):
    order_id, _ = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference="12345", charged_amount=3000)

    assert notify_payment(client, "1", tipo="merchant_order").status_code == 200
    assert notify_payment(client).status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


def test_notices_with_a_id_of_payment_that_no_is_a_number_ignore(client, db_session, mp, order_data):
    order_id, _ = order_data

    # El id va en la dirección de la consulta a Mercado Pago: no se consulta.
    assert notify_payment(client, "../users/me").status_code == 200
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


def test_if_mercado_payment_no_answers_the_notice_gives_502_for_that_it_retries(client, db_session, mp, order_data, caplog):
    order_id, _ = order_data
    mp.error = MercadoPagoUnavailable("caído")

    assert notify_payment(client).status_code == 502
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING
    assert "No se pudo consultar el pago 999: caído" in caplog.text


def test_with_key_secret_rejects_notices_without_signature_validates(client, db_session, mp, order_data, monkeypatch):
    order_id, _ = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)
    monkeypatch.setattr("app.core.mercadopago.MERCADOPAGO_WEBHOOK_SECRET", "secreto")

    without_signature = notify_payment(client)
    fake_signature = client.post(
        "/api/v1/pagos/webhook?data.id=999&type=payment",
        json={"type": "payment", "data": {"id": "999"}},
        headers={"x-signature": "ts=1,v1=abc", "x-request-id": "r-1"},
    )

    assert without_signature.status_code == 401
    assert fake_signature.status_code == 401
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


# =====================================================
# Firma de los avisos y cliente HTTP de Mercado Pago
# =====================================================


# =====================================================
# POST /api/v1/pagos/{order_id}/verificar: confirmar al volver
# =====================================================


def test_verify_a_payment_approved_brand_the_order_paid_without_wait_the_notice(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    response = verify_payment(client, order_id, headers)

    assert response.status_code == 200
    assert response.json() == {"estado": "approved"}
    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED
    assert len(sent_mails) == 1
    # Si después llega el aviso, no se manda otro mail.
    notify_payment(client)
    assert len(sent_mails) == 1


def test_verify_with_the_payment_of_another_order_no_changes_nothing(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id + 1), charged_amount=3000)

    response = verify_payment(client, order_id, headers)

    assert response.status_code == 200
    assert response.json() == {"estado": "pending"}
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING
    assert sent_mails == []


def test_verify_the_order_of_another_customer_gives_404(client, db_session, mp, order_data):
    order_id, _ = order_data
    other = make_client(db_session, username="beto", email="beto@example.com")
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    assert verify_payment(client, order_id, auth_headers(other)).status_code == 404
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING


def test_verify_with_mercado_payment_down_gives_503(client, db_session, mp, order_data, caplog):
    order_id, headers = order_data
    mp.error = MercadoPagoUnavailable("caído")

    assert verify_payment(client, order_id, headers).status_code == 503
    assert payment_state(db_session, order_id) == PaymentStatus.PENDING
    assert f"No se pudo verificar el pago 999 del pedido {order_id}: caído" in caplog.text


def test_verify_with_a_id_that_no_is_a_number_no_query(client, db_session, mp, order_data):
    order_id, headers = order_data
    # Si se consultara, el FakeMPClient fallaría: no tiene ese pago.
    response = verify_payment(client, order_id, headers, payment_id="null")

    assert response.status_code == 200
    assert response.json() == {"estado": "pending"}


def _firmar(secreto, data_id, request_id, ts):
    manifiesto = f"id:{data_id};request-id:{request_id};ts:{ts};"
    return hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()


def test_signature_validates_accepts_the_signature_of_mercado_payment():
    signature = f"ts=1704908010,v1={_firmar('secreto', '999', 'r-1', '1704908010')}"

    assert valid_signature(signature, "r-1", "999", secreto="secreto") is True
    assert valid_signature(signature, "r-1", "1000", secreto="secreto") is False
    assert valid_signature(signature, "r-1", "999", secreto="otro") is False
    assert valid_signature(None, "r-1", "999", secreto="secreto") is False


def test_signature_validates_without_key_configured_accepts():
    assert valid_signature(None, None, "999", secreto="") is True


def test_customer_http_creates_the_preference_with_the_token_and_returns_the_link():
    orders_list = []

    def respond(request):
        orders_list.append(request)
        return httpx.Response(201, json={"id": "pref-1", "init_point": "https://mp/pagar"})

    customer = MercadoPagoHTTPClient(token="APP_USR-1", transport=httpx.MockTransport(respond), url="https://mp")

    assert customer.create_preference({"items": []}) == ("pref-1", "https://mp/pagar")
    assert orders_list[0].url == "https://mp/checkout/preferences"
    assert orders_list[0].headers["Authorization"] == "Bearer APP_USR-1"
    assert json.loads(orders_list[0].content) == {"items": []}


def test_customer_http_query_the_payment():
    def respond(request):
        assert request.url == "https://mp/v1/payments/999"
        return httpx.Response(
            200,
            json={"id": 999, "status": "approved", "external_reference": "7", "transaction_amount": 3000.0},
        )

    customer = MercadoPagoHTTPClient(token="APP_USR-1", transport=httpx.MockTransport(respond), url="https://mp")

    assert customer.get_payment("999") == MPPayment(id="999", state="approved", reference="7", charged_amount=3000.0)


def test_customer_http_brings_the_link_of_a_preference_already_created():
    def respond(request):
        assert request.method == "GET"
        assert request.url == "https://mp/checkout/preferences/pref-1"
        return httpx.Response(200, json={"id": "pref-1", "init_point": "https://mp/pagar"})

    customer = MercadoPagoHTTPClient(token="APP_USR-1", transport=httpx.MockTransport(respond), url="https://mp")

    assert customer.get_preference("pref-1") == "https://mp/pagar"


@pytest.mark.parametrize(
    "token, respond",
    [
        ("", lambda request: httpx.Response(200, json={})),
        ("APP_USR-1", lambda request: httpx.Response(401, json={"message": "invalid token"})),
        ("APP_USR-1", lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("lento"))),
    ],
)
def test_customer_http_without_token_or_with_error_no_is_available(token, respond):
    customer = MercadoPagoHTTPClient(token=token, transport=httpx.MockTransport(respond), url="https://mp")

    with pytest.raises(MercadoPagoUnavailable):
        customer.get_payment("999")


# =====================================================
# Plazo para pagar: el pedido vence y el stock vuelve
# =====================================================


def expire(db_session, order_id, minutes_count=16):
    """Hace de cuenta que el pedido se confirmó hace `minutos` (el plazo es de 15)."""
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_count)
    db_session.commit()


def order_state(db_session, order_id):
    db_session.expire_all()
    return db_session.get(Order, order_id).status


def test_the_detail_brings_until_when_can_pay(client, db_session, order_data):
    order_id, headers = order_data

    body = client.get(f"/api/v1/orders/{order_id}", headers=headers).json()

    vence = datetime.fromisoformat(body["payment_due_at"])
    if vence.tzinfo is None:
        vence = vence.replace(tzinfo=timezone.utc)
    restante = vence - datetime.now(timezone.utc)
    assert timedelta(minutes=14) < restante <= timedelta(minutes=15)


def test_the_link_of_payment_expires_with_the_order(client, db_session, mp, order_data):
    order_id, headers = order_data

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert mp.preferencias[0]["expires"] is True
    assert mp.preferencias[0]["expiration_date_to"]


def test_the_link_of_payment_no_offers_pay_in_cash(client, db_session, mp, order_data):
    order_id, headers = order_data

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    # Abitab y RedPagos ("ticket") se pagan horas después: el pedido vencería antes.
    excluded = mp.preferencias[0]["payment_methods"]["excluded_payment_types"]
    assert {"id": "ticket"} in excluded


@pytest.mark.parametrize("mp_state", [None, "rejected"])
def test_a_order_without_pay_a_time_cancels_and_returns_the_stock(client, db_session, mp, order_data, mp_state):
    order_id, headers = order_data
    if mp_state:
        mp.payments["998"] = MPPayment(id="998", state=mp_state, reference=str(order_id))
        notify_payment(client, "998")
    expire(db_session, order_id)

    # Se cancela al ver el historial.
    body = client.get("/api/v1/orders", headers=headers).json()

    assert body["orders"][0]["status"] == "cancelled"
    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


def test_a_order_inside_of_the_deadline_keeps_reserved(client, db_session, order_data):
    order_id, headers = order_data
    expire(db_session, order_id, minutes_count=14)

    client.get("/api/v1/orders", headers=headers)

    assert order_state(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3


def test_expires_exactly_to_the_elapsing_the_deadline(client, db_session, order_data):
    order_id, _ = order_data
    current_time = datetime.now(timezone.utc)
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = current_time - timedelta(minutes=15)
    db_session.commit()

    assert cancel_expired_orders(db_session, current_time=current_time - timedelta(seconds=1)) == 0
    assert cancel_expired_orders(db_session, current_time=current_time) == 1


@pytest.mark.parametrize("ruta", ["/api/v1/parts", "/api/v1/parts/{part_id}", "/api/v1/parts/best-sellers"])
def test_see_the_catalog_frees_the_stock_of_a_order_expired(client, db_session, order_data, ruta):
    order_id, _ = order_data
    expire(db_session, order_id)
    part_id = db_session.query(Part).one().id

    assert client.get(ruta.format(part_id=part_id)).status_code == 200

    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


@pytest.mark.parametrize("ruta", ["/api/v1/analytics/stock", "/api/v1/analytics/stockout-risk"])
def test_the_dashboard_of_the_seller_frees_the_stock_of_a_order_expired(client, db_session, order_data, ruta):
    order_id, _ = order_data
    expire(db_session, order_id)
    seller = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    response = client.get(ruta, headers=auth_headers(seller, "employee"))

    assert response.status_code == 200
    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


def test_the_stock_of_a_order_expired_returns_before_of_another_purchase(client, db_session, order_data):
    order_id, _ = order_data
    expire(db_session, order_id)
    # Otro cliente quiere las 5 pastillas: 3 libres y 2 del pedido vencido.
    other = make_client(db_session, username="beto", email="beto@example.com")
    make_address(db_session, other)
    make_cart(db_session, other, [(db_session.query(Part).one(), 5)])

    response = client.post("/api/v1/orders", headers=auth_headers(other))

    assert response.status_code == 201
    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 0


def test_a_order_expired_no_gives_another_link(client, db_session, mp, order_data):
    order_id, headers = order_data
    expire(db_session, order_id)

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 409
    assert "no se pagó a tiempo" in response.json()["detail"]
    assert mp.preferencias == []


def test_the_orders_paid_no_expire(client, db_session, mp, order_data):
    order_id, headers = order_data
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)
    notify_payment(client)
    expire(db_session, order_id, minutes_count=60 * 24)

    assert cancel_expired_orders(db_session) == 0
    assert order_state(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3


def test_cancel_two_times_no_returns_the_stock_two_times(client, db_session, order_data):
    order_id, _ = order_data
    expire(db_session, order_id)

    assert cancel_expired_orders(db_session) == 1
    assert cancel_expired_orders(db_session) == 0
    db_session.expire_all()
    assert db_session.query(Part).one().stock == 5


def test_a_payment_approved_after_of_expire_reactivates_the_order_if_there_is_stock(client, db_session, mp, order_data, sent_mails):
    order_id, _ = order_data
    expire(db_session, order_id)
    cancel_expired_orders(db_session)
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    notify_payment(client)

    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED
    assert order_state(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3
    assert len(sent_mails) == 1


def pay_expired_without_stock(db_session, mp, order_id):
    """El pedido vence, otro se lleva el stock y después llega el pago aprobado."""
    expire(db_session, order_id)
    cancel_expired_orders(db_session)
    brake_pads = db_session.query(Part).one()
    brake_pads.stock = 0
    db_session.commit()
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)


def test_a_payment_approved_after_of_expire_without_stock_stays_cancelled_and_notifies_to_the_customer(
    client, db_session, mp, order_data, sent_mails, caplog
):
    order_id, _ = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    notify_payment(client)

    assert payment_state(db_session, order_id) == PaymentStatus.APPROVED
    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 0
    assert f"Pedido {order_id} pagado después de vencer y sin stock" in caplog.text
    # El cliente no recibe la confirmación de compra, sino el aviso de devolución.
    assert len(sent_mails) == 1
    assert sent_mails[0]["Subject"] == f"No pudimos completar tu pedido #{order_id}"
    texto = sent_mails[0].get_body(preferencelist=("plain",)).get_content()
    assert "te vamos a devolver el dinero" in texto


def test_verify_a_payment_of_a_order_expired_without_stock_notifies_to_the_customer(client, db_session, mp, order_data, sent_mails):
    order_id, headers = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    response = verify_payment(client, order_id, headers)

    assert response.json()["estado"] == "approved"
    assert order_state(db_session, order_id) == OrderStatus.CANCELLED
    assert [mail_message["Subject"] for mail_message in sent_mails] == [f"No pudimos completar tu pedido #{order_id}"]


def test_a_notice_repetido_of_a_order_expired_without_stock_no_sends_another_mail(client, db_session, mp, order_data, sent_mails):
    order_id, _ = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    notify_payment(client)
    notify_payment(client)

    assert len(sent_mails) == 1



# =====================================================
# Devolución del pago tardío sin stock
# =====================================================


def payment_of_order(db_session, order_id):
    db_session.expire_all()
    return db_session.query(Payment).filter_by(order_id=order_id).one()


def test_a_payment_late_without_stock_returns_only(client, db_session, mp, order_data, sent_mails):
    order_id, _ = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    notify_payment(client)

    assert mp.refunds == [("999", f"autobought-devolucion-pedido-{order_id}")]
    assert payment_of_order(db_session, order_id).refunded_at is not None
    assert [mail_message["Subject"] for mail_message in sent_mails] == [f"No pudimos completar tu pedido #{order_id}"]


def test_verify_a_payment_late_without_stock_also_it_returns(client, db_session, mp, order_data):
    order_id, headers = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    verify_payment(client, order_id, headers)

    assert len(mp.refunds) == 1
    assert payment_of_order(db_session, order_id).refunded_at is not None


def test_a_notice_repetido_no_returns_two_times(client, db_session, mp, order_data):
    order_id, headers = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    notify_payment(client)
    notify_payment(client)
    verify_payment(client, order_id, headers)

    assert len(mp.refunds) == 1


def test_a_payment_late_with_stock_reactivates_the_order_and_no_returns_nothing(client, db_session, mp, order_data):
    order_id, _ = order_data
    expire(db_session, order_id)
    cancel_expired_orders(db_session)
    mp.payments["999"] = MPPayment(id="999", state="approved", reference=str(order_id), charged_amount=3000)

    notify_payment(client)

    assert mp.refunds == []
    assert payment_of_order(db_session, order_id).refunded_at is None


def test_if_mercado_payment_no_returns_notifies_same_and_the_cron_it_retries(client, db_session, mp, order_data, sent_mails, caplog):
    order_id, _ = order_data
    pay_expired_without_stock(db_session, mp, order_id)

    # Mercado Pago responde la consulta del pago, pero falla al devolver.
    def refund_down(payment_id_value, key):
        raise MercadoPagoUnavailable("timeout")

    mp.refund_payment = refund_down
    notify_payment(client)

    assert payment_of_order(db_session, order_id).refunded_at is None
    assert f"No se pudo devolver el pago del pedido {order_id}" in caplog.text
    assert len(sent_mails) == 1  # el cliente igual se entera

    # Al otro día Mercado Pago responde y el cron hace la devolución.
    del mp.refund_payment
    assert crud_payment.refund_pending(db_session, mp) == 1
    assert payment_of_order(db_session, order_id).refunded_at is not None
    assert mp.refunds == [("999", f"autobought-devolucion-pedido-{order_id}")]
    # Y no la vuelve a hacer.
    assert crud_payment.refund_pending(db_session, mp) == 0


def test_the_cron_no_returns_the_cancelled_by_the_seller(client, db_session, mp, order_data):
    order_id, _ = order_data
    pay_expired_without_stock(db_session, mp, order_id)
    payment_data = payment_of_order(db_session, order_id)
    payment_data.status = PaymentStatus.APPROVED
    payment_data.mp_payment_id = "999"
    # Lo canceló el vendedor (ya devolvió él al cancelar): tiene motivo escrito.
    payment_data.order.cancellation_reason = "Sin stock en el depósito"
    db_session.commit()

    assert crud_payment.refund_pending(db_session, mp) == 0
    assert mp.refunds == []
