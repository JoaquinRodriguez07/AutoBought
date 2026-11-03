"""Pago de los pedidos con Mercado Pago. Mercado Pago está simulado: el CI
nunca lo llama."""

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.core.mercadopago import (
    ClienteMercadoPagoHTTP,
    MercadoPagoNoDisponible,
    PagoMP,
    firma_valida,
    get_cliente_mp,
)
from app.core.security import hash_password
from app.crud import user as crud_user
from app.crud.order import cancel_expired_orders
from app.models.cart_item import CartItem
from app.models.order import Order, OrderStatus
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
        self.consultadas: list[str] = []

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

    def consultar_preferencia(self, preferencia_id: str) -> str:
        if self.error:
            raise self.error
        self.consultadas.append(preferencia_id)
        return f"https://mercadopago.test/checkout/{preferencia_id}"


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


def verificar(client, order_id, headers, payment_id="999"):
    """Lo que hace la tienda al volver de Mercado Pago con ?payment_id=..."""
    return client.post(f"/api/v1/pagos/{order_id}/verificar", headers=headers, json={"payment_id": payment_id})


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
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)
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


def test_pagar_de_nuevo_con_el_pago_pendiente_abre_el_mismo_link(client, db_session, mp, pedido):
    order_id, headers = pedido
    primero = client.post(f"/api/v1/pagos/{order_id}", headers=headers).json()

    segundo = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert segundo.status_code == 200
    assert segundo.json() == primero
    # No se creó otra preferencia: se pidió el link de la que ya había.
    assert len(mp.preferencias) == 1
    assert mp.consultadas == ["pref-1"]
    assert db_session.query(Payment).one().mp_preference_id == "pref-1"


def test_pagar_de_nuevo_despues_de_un_rechazo_crea_un_link_nuevo(client, db_session, mp, pedido):
    order_id, headers = pedido
    client.post(f"/api/v1/pagos/{order_id}", headers=headers)
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))
    avisar(client, "998")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.json() == {"url": "https://mercadopago.test/checkout/pref-2"}
    assert len(mp.preferencias) == 2
    assert mp.consultadas == []


def test_si_mercado_pago_no_devuelve_el_link_vigente_da_503(client, db_session, mp, pedido, caplog):
    order_id, headers = pedido
    client.post(f"/api/v1/pagos/{order_id}", headers=headers)
    mp.error = MercadoPagoNoDisponible("Mercado Pago no respondió: ConnectTimeout.")

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 503
    assert f"No se pudo crear el link de pago del pedido {order_id}" in caplog.text


# =====================================================
# POST /orders sin Mercado Pago configurado
# =====================================================


def test_sin_token_de_mercado_pago_no_se_crea_el_pedido(client, db_session, monkeypatch):
    monkeypatch.setattr("app.core.config.MERCADOPAGO_ACCESS_TOKEN", "")
    cliente = make_client(db_session)
    make_address(db_session, cliente)
    pastillas = make_part(db_session, stock=5, price=1500)
    make_cart(db_session, cliente, [(pastillas, 2)])

    response = client.post("/api/v1/orders", headers=auth_headers(cliente))

    assert response.status_code == 503
    assert "carrito quedó igual" in response.json()["detail"]
    db_session.expire_all()
    assert db_session.query(Order).count() == 0
    assert db_session.query(Part).one().stock == 5
    assert db_session.query(CartItem).one().amount == 2


# =====================================================
# POST /api/v1/pagos/webhook: avisos de Mercado Pago
# =====================================================


def test_aviso_de_pago_aprobado_marca_el_pedido_pagado_y_manda_el_mail(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)

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


def test_un_link_nuevo_despues_de_un_rechazo_deja_el_pago_pendiente(client, db_session, mp, pedido):
    order_id, headers = pedido
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))
    avisar(client, "998")

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    # Si al volver de pagar bien el aviso todavía no llegó, no se muestra el
    # rechazo viejo (y el cliente no paga dos veces).
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_reintentar_despues_de_un_rechazo_y_aprobar(client, db_session, mp, pedido):
    order_id, _ = pedido
    mp.pagos["998"] = PagoMP(id="998", estado="rejected", referencia=str(order_id))
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)

    avisar(client, "998")
    avisar(client, "999")

    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED


@pytest.mark.parametrize("monto", [1500, 3000.5, None])
def test_un_pago_aprobado_por_otro_monto_queda_rechazado_y_en_el_log(
    client, db_session, mp, pedido, mails, caplog, monto
):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=monto)

    response = avisar(client)

    assert response.status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.REJECTED
    assert mails == []
    assert f"El pago 999 del pedido {order_id} se aprobó por {monto}, pero el pedido cuesta 3000" in caplog.text


def test_verificar_un_pago_por_otro_monto_no_lo_da_por_pagado(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=1)

    response = verificar(client, order_id, headers)

    assert response.json() == {"estado": "rejected"}
    assert mails == []


def test_un_aviso_repetido_no_se_procesa_dos_veces(client, db_session, mp, pedido, mails):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)
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
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia="12345", monto=3000)

    assert avisar(client, "1", tipo="merchant_order").status_code == 200
    assert avisar(client).status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_avisos_con_un_id_de_pago_que_no_es_un_numero_se_ignoran(client, db_session, mp, pedido):
    order_id, _ = pedido

    # El id va en la dirección de la consulta a Mercado Pago: no se consulta.
    assert avisar(client, "../users/me").status_code == 200
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_si_mercado_pago_no_responde_el_aviso_da_502_para_que_lo_reintente(client, db_session, mp, pedido, caplog):
    order_id, _ = pedido
    mp.error = MercadoPagoNoDisponible("caído")

    assert avisar(client).status_code == 502
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING
    assert "No se pudo consultar el pago 999: caído" in caplog.text


def test_con_clave_secreta_rechaza_avisos_sin_firma_valida(client, db_session, mp, pedido, monkeypatch):
    order_id, _ = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)
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


# =====================================================
# POST /api/v1/pagos/{order_id}/verificar: confirmar al volver
# =====================================================


def test_verificar_un_pago_aprobado_marca_el_pedido_pagado_sin_esperar_el_aviso(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)

    response = verificar(client, order_id, headers)

    assert response.status_code == 200
    assert response.json() == {"estado": "approved"}
    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED
    assert len(mails) == 1
    # Si después llega el aviso, no se manda otro mail.
    avisar(client)
    assert len(mails) == 1


def test_verificar_con_el_pago_de_otro_pedido_no_cambia_nada(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id + 1), monto=3000)

    response = verificar(client, order_id, headers)

    assert response.status_code == 200
    assert response.json() == {"estado": "pending"}
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING
    assert mails == []


def test_verificar_el_pedido_de_otro_cliente_da_404(client, db_session, mp, pedido):
    order_id, _ = pedido
    otro = make_client(db_session, username="beto", email="beto@example.com")
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)

    assert verificar(client, order_id, auth_headers(otro)).status_code == 404
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING


def test_verificar_con_mercado_pago_caido_da_503(client, db_session, mp, pedido, caplog):
    order_id, headers = pedido
    mp.error = MercadoPagoNoDisponible("caído")

    assert verificar(client, order_id, headers).status_code == 503
    assert estado_del_pago(db_session, order_id) == PaymentStatus.PENDING
    assert f"No se pudo verificar el pago 999 del pedido {order_id}: caído" in caplog.text


def test_verificar_con_un_id_que_no_es_un_numero_no_consulta(client, db_session, mp, pedido):
    order_id, headers = pedido
    # Si se consultara, el ClienteMPFalso fallaría: no tiene ese pago.
    response = verificar(client, order_id, headers, payment_id="null")

    assert response.status_code == 200
    assert response.json() == {"estado": "pending"}


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
        return httpx.Response(
            200,
            json={"id": 999, "status": "approved", "external_reference": "7", "transaction_amount": 3000.0},
        )

    cliente = ClienteMercadoPagoHTTP(token="APP_USR-1", transport=httpx.MockTransport(responder), url="https://mp")

    assert cliente.consultar_pago("999") == PagoMP(id="999", estado="approved", referencia="7", monto=3000.0)


def test_cliente_http_trae_el_link_de_una_preferencia_ya_creada():
    def responder(request):
        assert request.method == "GET"
        assert request.url == "https://mp/checkout/preferences/pref-1"
        return httpx.Response(200, json={"id": "pref-1", "init_point": "https://mp/pagar"})

    cliente = ClienteMercadoPagoHTTP(token="APP_USR-1", transport=httpx.MockTransport(responder), url="https://mp")

    assert cliente.consultar_preferencia("pref-1") == "https://mp/pagar"


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


# =====================================================
# Plazo para pagar: el pedido vence y el stock vuelve
# =====================================================


def vencer(db_session, order_id, minutos=16):
    """Hace de cuenta que el pedido se confirmó hace `minutos` (el plazo es de 15)."""
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = datetime.now(timezone.utc) - timedelta(minutes=minutos)
    db_session.commit()


def estado_del_pedido(db_session, order_id):
    db_session.expire_all()
    return db_session.get(Order, order_id).status


def test_el_detalle_trae_hasta_cuando_se_puede_pagar(client, db_session, pedido):
    order_id, headers = pedido

    body = client.get(f"/api/v1/orders/{order_id}", headers=headers).json()

    vence = datetime.fromisoformat(body["payment_due_at"])
    if vence.tzinfo is None:
        vence = vence.replace(tzinfo=timezone.utc)
    restante = vence - datetime.now(timezone.utc)
    assert timedelta(minutes=14) < restante <= timedelta(minutes=15)


def test_el_link_de_pago_vence_con_el_pedido(client, db_session, mp, pedido):
    order_id, headers = pedido

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert mp.preferencias[0]["expires"] is True
    assert mp.preferencias[0]["expiration_date_to"]


def test_el_link_de_pago_no_ofrece_pagar_en_efectivo(client, db_session, mp, pedido):
    order_id, headers = pedido

    client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    # Abitab y RedPagos ("ticket") se pagan horas después: el pedido vencería antes.
    excluidos = mp.preferencias[0]["payment_methods"]["excluded_payment_types"]
    assert {"id": "ticket"} in excluidos


@pytest.mark.parametrize("estado_mp", [None, "rejected"])
def test_un_pedido_sin_pagar_a_tiempo_se_cancela_y_devuelve_el_stock(client, db_session, mp, pedido, estado_mp):
    order_id, headers = pedido
    if estado_mp:
        mp.pagos["998"] = PagoMP(id="998", estado=estado_mp, referencia=str(order_id))
        avisar(client, "998")
    vencer(db_session, order_id)

    # Se cancela al ver el historial.
    body = client.get("/api/v1/orders", headers=headers).json()

    assert body["orders"][0]["status"] == "cancelled"
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


def test_un_pedido_dentro_del_plazo_sigue_reservado(client, db_session, pedido):
    order_id, headers = pedido
    vencer(db_session, order_id, minutos=14)

    client.get("/api/v1/orders", headers=headers)

    assert estado_del_pedido(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3


def test_vence_justo_al_cumplirse_el_plazo(client, db_session, pedido):
    order_id, _ = pedido
    ahora = datetime.now(timezone.utc)
    payment = db_session.query(Payment).filter_by(order_id=order_id).one()
    payment.created_at = ahora - timedelta(minutes=15)
    db_session.commit()

    assert cancel_expired_orders(db_session, ahora=ahora - timedelta(seconds=1)) == 0
    assert cancel_expired_orders(db_session, ahora=ahora) == 1


@pytest.mark.parametrize("ruta", ["/api/v1/parts", "/api/v1/parts/{part_id}", "/api/v1/parts/best-sellers"])
def test_ver_el_catalogo_libera_el_stock_de_un_pedido_vencido(client, db_session, pedido, ruta):
    order_id, _ = pedido
    vencer(db_session, order_id)
    part_id = db_session.query(Part).one().id

    assert client.get(ruta.format(part_id=part_id)).status_code == 200

    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


@pytest.mark.parametrize("ruta", ["/api/v1/analytics/stock", "/api/v1/analytics/stockout-risk"])
def test_el_dashboard_del_vendedor_libera_el_stock_de_un_pedido_vencido(client, db_session, pedido, ruta):
    order_id, _ = pedido
    vencer(db_session, order_id)
    vendedor = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    response = client.get(ruta, headers=auth_headers(vendedor, "employee"))

    assert response.status_code == 200
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 5


def test_el_stock_de_un_pedido_vencido_vuelve_antes_de_otra_compra(client, db_session, pedido):
    order_id, _ = pedido
    vencer(db_session, order_id)
    # Otro cliente quiere las 5 pastillas: 3 libres y 2 del pedido vencido.
    otro = make_client(db_session, username="beto", email="beto@example.com")
    make_address(db_session, otro)
    make_cart(db_session, otro, [(db_session.query(Part).one(), 5)])

    response = client.post("/api/v1/orders", headers=auth_headers(otro))

    assert response.status_code == 201
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 0


def test_un_pedido_vencido_no_da_otro_link(client, db_session, mp, pedido):
    order_id, headers = pedido
    vencer(db_session, order_id)

    response = client.post(f"/api/v1/pagos/{order_id}", headers=headers)

    assert response.status_code == 409
    assert "no se pagó a tiempo" in response.json()["detail"]
    assert mp.preferencias == []


def test_los_pedidos_pagados_no_vencen(client, db_session, mp, pedido):
    order_id, headers = pedido
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)
    avisar(client)
    vencer(db_session, order_id, minutos=60 * 24)

    assert cancel_expired_orders(db_session) == 0
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3


def test_cancelar_dos_veces_no_devuelve_el_stock_dos_veces(client, db_session, pedido):
    order_id, _ = pedido
    vencer(db_session, order_id)

    assert cancel_expired_orders(db_session) == 1
    assert cancel_expired_orders(db_session) == 0
    db_session.expire_all()
    assert db_session.query(Part).one().stock == 5


def test_un_pago_aprobado_despues_de_vencer_reactiva_el_pedido_si_hay_stock(client, db_session, mp, pedido, mails):
    order_id, _ = pedido
    vencer(db_session, order_id)
    cancel_expired_orders(db_session)
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)

    avisar(client)

    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CONFIRMED
    assert db_session.query(Part).one().stock == 3
    assert len(mails) == 1


def pagar_vencido_sin_stock(db_session, mp, order_id):
    """El pedido vence, otro se lleva el stock y después llega el pago aprobado."""
    vencer(db_session, order_id)
    cancel_expired_orders(db_session)
    pastillas = db_session.query(Part).one()
    pastillas.stock = 0
    db_session.commit()
    mp.pagos["999"] = PagoMP(id="999", estado="approved", referencia=str(order_id), monto=3000)


def test_un_pago_aprobado_despues_de_vencer_sin_stock_queda_cancelado_y_avisa_al_cliente(
    client, db_session, mp, pedido, mails, caplog
):
    order_id, _ = pedido
    pagar_vencido_sin_stock(db_session, mp, order_id)

    avisar(client)

    assert estado_del_pago(db_session, order_id) == PaymentStatus.APPROVED
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert db_session.query(Part).one().stock == 0
    assert f"Pedido {order_id} pagado después de vencer y sin stock" in caplog.text
    # El cliente no recibe la confirmación de compra, sino el aviso de devolución.
    assert len(mails) == 1
    assert mails[0]["Subject"] == f"No pudimos completar tu pedido #{order_id}"
    texto = mails[0].get_body(preferencelist=("plain",)).get_content()
    assert "te vamos a devolver el dinero" in texto


def test_verificar_un_pago_de_un_pedido_vencido_sin_stock_avisa_al_cliente(client, db_session, mp, pedido, mails):
    order_id, headers = pedido
    pagar_vencido_sin_stock(db_session, mp, order_id)

    response = verificar(client, order_id, headers)

    assert response.json()["estado"] == "approved"
    assert estado_del_pedido(db_session, order_id) == OrderStatus.CANCELLED
    assert [mail["Subject"] for mail in mails] == [f"No pudimos completar tu pedido #{order_id}"]


def test_un_aviso_repetido_de_un_pedido_vencido_sin_stock_no_manda_otro_mail(client, db_session, mp, pedido, mails):
    order_id, _ = pedido
    pagar_vencido_sin_stock(db_session, mp, order_id)

    avisar(client)
    avisar(client)

    assert len(mails) == 1
