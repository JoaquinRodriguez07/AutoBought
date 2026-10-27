"""Pago de los pedidos con Mercado Pago. Mercado Pago está simulado: el CI
nunca lo llama."""

import hashlib
import hmac
import json

import httpx
import pytest

from app.core.mercadopago import (
    ClienteMercadoPagoHTTP,
    MercadoPagoNoDisponible,
    PagoMP,
    firma_valida,
    get_cliente_mp,
)
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from backend.main import app
from order_test import auth_headers, make_address, make_cart, make_client, make_part


class ClienteMPFalso:
    def __init__(self):
        self.preferencias: list[dict] = []
        # Lo que "responde" Mercado Pago al consultar cada pago.
        self.pagos: dict[str, PagoMP] = {}
        self.error: Exception | None = None

    def crear_preferencia(self, preferencia: dict) -> tuple[str, str]:
        if self.error:
            raise self.error
        self.preferencias.append(preferencia)
        numero = len(self.preferencias)
        return f"pref-{numero}", f"https://mercadopago.test/checkout/pref-{numero}"

    def consultar_pago(self, pago_id: str) -> PagoMP:
        if self.error:
            raise self.error
        return self.pagos[pago_id]


@pytest.fixture
def mp(client):
    falso = ClienteMPFalso()
    app.dependency_overrides[get_cliente_mp] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_cliente_mp, None)


@pytest.fixture
def pedido(client, db_session):
    """Un pedido recién confirmado (pago pendiente) y los headers de su cliente."""
    cliente = make_client(db_session)
    make_address(db_session, cliente)
    pastillas = make_part(db_session, stock=5, price=1500)
    make_cart(db_session, cliente, [(pastillas, 2)])
    headers = auth_headers(cliente)
    order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]
    return order_id, headers


def avisar(client, pago_id="999", tipo="payment"):
    """El aviso (webhook) que manda Mercado Pago cuando cambia un pago."""
    return client.post(
        f"/api/v1/pagos/webhook?data.id={pago_id}&type={tipo}",
        json={"action": "payment.updated", "type": tipo, "data": {"id": pago_id}},
    )


def estado_del_pago(db_session, order_id):
    db_session.expire_all()
    return db_session.query(Payment).filter_by(order_id=order_id).one().status


# =====================================================
# POST /api/v1/pagos/{order_id}: link de pago
# =====================================================


def test_crea_el_link_de_pago_con_los_items_y_el_numero_de_pedido(client, db_session, mp, pedido):
    order_id, headers = pedido

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"url": "https://mercadopago.test/checkout/pref-1"}
    preferencia = mp.preferencias[0]
    assert preferencia["external_reference"] == str(order_id)
    assert preferencia["items"] == [
        {"id": preferencia["items"][0]["id"], "title": "Pastillas de freno",
         "quantity": 2, "unit_price": 1500, "currency_id": "UYU"},
    ]
    assert preferencia["back_urls"]["failure"].endswith(f"/pago?pedido={order_id}")
    assert db_session.query(Payment).one().mp_preference_id == "pref-1"


def test_el_link_de_un_pedido_ajeno_da_404(client, db_session, mp, pedido):
    order_id, _ = pedido
    otro = make_client(db_session, username="beto", email="beto@example.com")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=auth_headers(otro))

    assert response.status_code == 404
    assert mp.preferencias == []


def test_un_pedido_pagado_no_da_otro_link(client, db_session, mp, pedido):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id))
    avisar(client)

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 409


def test_si_mercado_pago_no_responde_el_link_da_503_y_lo_registra(client, db_session, mp, pedido, caplog):
    order_id, headers = pedido
    mp.error = MercadoPagoNoDisponible("No hay token de Mercado Pago configurado.")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 503
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING
    # El motivo real queda en el log del backend.
    assert f"No se pudo crear el link de pago del pedido {order_id}: No hay token" in caplog.text


# =====================================================
# POST /api/v1/pagos/webhook: avisos de Mercado Pago
# =====================================================


def test_aviso_de_pago_aprobado_marca_el_pedido_pagado_y_manda_el_mail(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id))

    response = avisar(client)

    assert response.status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED
    assert db_session.query(Payment).one().mp_payment_id == "999"
    assert client.get(f"/api/v1/orders/{order_id}", headers=headers).json()["payment_status"] == "approved"

    assert len(mails) == 1
    assert mails[0]["Subject"] == f"Confirmamos tu pedido #{order_id}"
    texto = mails[0].get_body(preferencelist=("plain",)).get_content()
    assert "2 x Pastillas de freno: $ 3.000" in texto
    assert "Mercado Pago" in texto


def test_aviso_de_pago_rechazado_deja_el_pedido_sin_pagar_y_con_stock_reservado(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))

    response = avisar(client, "998")

    assert response.status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.REJECTED
    assert mails == []
    # El stock queda reservado para reintentar.
    assert db_session.query(Part).one().stock == 3
    # Y se puede reintentar con un link nuevo.
    assert client.post(f"/api/v1/pagos/{order_id}", headers=headers).status_code == 200


def test_reintentar_despues_de_un_rechazo_y_aprobar(client, db_session, mp, pedido):
    order_id, _ = pedido
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id))

    avisar(client, "998")
    avisar(client, "999")

    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED


def test_un_aviso_repetido_no_se_procesa_dos_veces(client, db_session, mp, pedido, mails):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id))
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))

    avisar(client)
    avisar(client)
    # Un rechazo que llega tarde no deshace el pago aprobado.
    avisar(client, "998")

    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED
    assert db_session.query(Payment).one().mp_payment_id == "999"
    assert len(mails) == 1


def test_un_pago_en_proceso_deja_el_pedido_pendiente(client, db_session, mp, pedido):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="in_process", referencia=str(order_id))

    assert avisar(client).status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_el_estado_sale_de_consultar_a_mercado_pago_no_del_aviso(client, db_session, mp, pedido):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="rejected", referencia=str(order_id))

    # Aunque el aviso diga "approved", Mercado Pago responde "rejected".
    client.post(
        "/api/v1/pagos/webhook?data.id=999&type=payment",
        json={"type": "payment", "data": {"id": "999"}, "status": "approved"},
    )

    assert estado_del_pago(db_session, order_id) == PaymentStatus.REJECTED


def test_avisos_que_no_son_de_pagos_o_de_otro_pedido_se_ignoran(client, db_session, mp, pedido):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia="12345")

    assert avisar(client, "1", tipo="merchant_order").status_code == 200
    assert avisar(client).status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_si_mercado_pago_no_responde_el_aviso_da_502_para_que_lo_reintente(client, db_session, mp, pedido, caplog):
    order_id, _ = pedido
    mp.error = MercadoPagoNoDisponible("caído")

    assert avisar(client).status_code == 502
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING
    assert "No se pudo consultar el pago 999: caído" in caplog.text


def test_con_clave_secreta_rechaza_avisos_sin_firma_valida(client, db_session, mp, pedido, monkeypatch):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id))
    monkeypatch.setattr("app.core.mercadopago.MERCADOPAGO_WEBHOOK_SECRET", "secreto")

    sin_firma = avisar(client)
    firma_falsa = client.post(
        "/api/v1/pagos/webhook?data.id=999&type=payment",
        json={"type": "payment", "data": {"id": "999"}},
        headers={"x-signature": "ts=1,v1=abc", "x-request-id": "r-1"},
    )

    assert sin_firma.status_code == 401
    assert firma_falsa.status_code == 401
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


# =====================================================
# Firma de los avisos y cliente HTTP de Mercado Pago
# =====================================================


def _firmar(secreto, data_id, request_id, ts):
    manifiesto = f"id:{data_id};request-id:{request_id};ts:{ts};"
    return hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()


def test_firma_valida_acepta_la_firma_de_mercado_pago():
    firma = f"ts=1704908010,v1={_firmar('secreto', '999', 'r-1', '1704908010')}"

    assert firma_valida(firma, "r-1", "999", secreto="secreto") is True
    assert firma_valida(firma, "r-1", "1000", secreto="secreto") is False
    assert firma_valida(firma, "r-1", "999", secreto="otro") is False
    assert firma_valida(None, "r-1", "999", secreto="secreto") is False


def test_firma_valida_sin_clave_configurada_acepta():
    assert firma_valida(None, None, "999", secreto="") is True


def test_cliente_http_crea_la_preferencia_con_el_token_y_devuelve_el_link():
    pedidos = []

    def responder(request):
        pedidos.append(request)
        return httpx.Response(201, json={"id": "pref-1", "init_point": "https://mp/pagar"})

    cliente = ClienteMercadoPagoHTTP(token="APP_USR-1", transport=httpx.MockTransport(responder), url="https://mp")

    assert cliente.crear_preferencia({"items": []}) == ("pref-1", "https://mp/pagar")
    assert pedidos[0].url == "https://mp/checkout/preferences"
    assert pedidos[0].headers["Authorization"] == "Bearer APP_USR-1"
    assert json.loads(pedidos[0].content) == {"items": []}


def test_cliente_http_consulta_el_pago():
    def responder(request):
        assert request.url == "https://mp/v1/payments/999"
        return httpx.Response(200, json={"id": 999, "status": "approved", "external_reference": "7"})

    cliente = ClienteMercadoPagoHTTP(token="APP_USR-1", transport=httpx.MockTransport(responder), url="https://mp")

    assert cliente.consultar_pago("999") == PagoMP(id="999", estado="approved", referencia="7")


@pytest.mark.parametrize(
    "token, responder",
    [
        ("", lambda request: httpx.Response(200, json={})),
        ("APP_USR-1", lambda request: httpx.Response(401, json={"message": "invalid token"})),
        ("APP_USR-1", lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("lento"))),
    ],
)
def test_cliente_http_sin_token_o_con_error_no_esta_disponible(token, responder):
    cliente = ClienteMercadoPagoHTTP(token=token, transport=httpx.MockTransport(responder), url="https://mp")

    with pytest.raises(MercadoPagoNoDisponible):
        cliente.consultar_pago("999")
