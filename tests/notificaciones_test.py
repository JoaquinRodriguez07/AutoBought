import re
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks

from app.core import notificaciones
from app.core.security import DARSE_DE_BAJA, create_access_token, create_purpose_token
from app.crud import cart as crud_cart
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.stock_alert import StockAlert
from scripts import tareas_diarias

AHORA = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

PREFERENCES = "/api/v1/auth/me/preferences"
UNSUBSCRIBE = "/api/v1/auth/unsubscribe"
ME = "/api/v1/auth/me"


def make_client(db, nombre="Ana", email="ana@example.com", marketing=True):
    cliente = Client(
        username=email.split("@")[0], password="secret", name=nombre, email=email,
        email_verified=True, marketing_emails=marketing,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


def make_part(db, name="Aceite 10W-40 4L", price=1500, stock=5, code="ACE-001"):
    part = Part(part_code=code, name=name, category="Lubricantes", price=price, stock=stock)
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


def make_order(db, cliente, items, creado=AHORA, status=OrderStatus.CONFIRMED):
    order = Order(
        client_id=cliente.user_id, created_at=creado, status=status,
        ship_personal_name="Casa", ship_street="Av. Italia", ship_number="1234", ship_apartment="301",
        ship_city="Montevideo", ship_department="Montevideo", payment_method_label="Visa •••• 1234",
    )
    db.add(order)
    db.flush()
    for part, cantidad in items:
        db.add(OrderItem(order_id=order.order_id, part_id=part.id, quantity=cantidad, frozen_price=part.price))
    db.commit()
    db.refresh(order)
    return order


def make_cart(db, cliente, items, actualizado):
    db.add(Cart(client_id=cliente.user_id, updated_at=actualizado))
    for part, cantidad in items:
        db.add(CartItem(cart_id=cliente.user_id, part_id=part.id, amount=cantidad))
    db.commit()


def auth_headers(user):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": "client"})
    return {"Authorization": f"Bearer {token}"}


def texto(mensaje):
    return mensaje.get_body(preferencelist=("plain",)).get_content()


def html(mensaje):
    return mensaje.get_body(preferencelist=("html",)).get_content()


# =====================================================
# Pedidos
# =====================================================


def test_cambio_a_enviado_y_entregado(db_session, mails):
    cliente = make_client(db_session)
    order = make_order(db_session, cliente, [(make_part(db_session), 2)])

    order.status = OrderStatus.SHIPPED
    notificaciones.notificar_cambio_de_estado(order)
    order.status = OrderStatus.DELIVERED
    notificaciones.notificar_cambio_de_estado(order)

    assert [m["Subject"] for m in mails] == [
        f"Tu pedido #{order.order_id} fue enviado",
        f"Tu pedido #{order.order_id} fue entregado",
    ]
    assert "Ya está en camino" in texto(mails[0])
    assert "2 x Aceite 10W-40 4L: $ 3.000" in texto(mails[0])
    assert "Av. Italia 1234, apto. 301, Montevideo, Montevideo" in texto(mails[0])
    assert "/historial" in texto(mails[1])


def test_cancelacion_usa_su_propio_mail(db_session, mails):
    cliente = make_client(db_session)
    order = make_order(db_session, cliente, [(make_part(db_session), 1)], status=OrderStatus.CANCELLED)

    notificaciones.notificar_cambio_de_estado(order)

    assert len(mails) == 1
    assert mails[0]["Subject"] == f"Cancelamos tu pedido #{order.order_id}"
    assert "quedó cancelado" in texto(mails[0])


def test_confirmado_no_manda_otro_mail(db_session, mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])

    notificaciones.notificar_cambio_de_estado(order)

    assert mails == []


def test_desde_un_endpoint_se_manda_despues_de_responder(db_session, mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])
    tareas = BackgroundTasks()

    notificaciones.notificar_compra(order, tareas)

    assert mails == []
    assert len(tareas.tasks) == 1


def test_los_mails_de_pedidos_no_traen_enlace_de_baja(db_session, mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])

    notificaciones.notificar_compra(order)

    assert "List-Unsubscribe" not in mails[0]
    assert "No quiero recibir estos mails" not in html(mails[0])


# =====================================================
# Vuelta de stock
# =====================================================


def test_vuelta_de_stock_avisa_una_vez_a_los_suscritos(db_session, mails):
    ana = make_client(db_session)
    beto = make_client(db_session, nombre="Beto", email="beto@example.com", marketing=False)
    part = make_part(db_session, name="Faro delantero", stock=0, price=8900)
    db_session.add_all([StockAlert(client_id=ana.user_id, part_id=part.id), StockAlert(client_id=beto.user_id, part_id=part.id)])
    db_session.commit()

    part.stock = 3
    avisados = notificaciones.notificar_vuelta_de_stock(db_session, part, stock_anterior=0)

    # La suscripción la pidió el cliente: le llega aunque esté dado de baja de los comerciales.
    assert avisados == 2
    assert sorted(m["To"] for m in mails) == ["ana@example.com", "beto@example.com"]
    assert "Faro delantero — $ 8.900" in texto(mails[0])
    assert "/catalogo?q=Faro%20delantero" in texto(mails[0])
    assert db_session.query(StockAlert).count() == 0

    assert notificaciones.notificar_vuelta_de_stock(db_session, part, stock_anterior=0) == 0
    assert len(mails) == 2


def test_si_ya_habia_stock_o_sigue_sin_haber_no_avisa(db_session, mails):
    cliente = make_client(db_session)
    part = make_part(db_session, stock=0)
    db_session.add(StockAlert(client_id=cliente.user_id, part_id=part.id))
    db_session.commit()

    sigue_agotado = notificaciones.notificar_vuelta_de_stock(db_session, part, stock_anterior=0)
    part.stock = 8
    ya_habia = notificaciones.notificar_vuelta_de_stock(db_session, part, stock_anterior=5)

    assert sigue_agotado == ya_habia == 0
    assert mails == []
    assert db_session.query(StockAlert).count() == 1


# =====================================================
# Baja de precio
# =====================================================


def test_baja_de_precio_avisa_a_los_favoritos_que_no_se_dieron_de_baja(db_session, mails):
    ana = make_client(db_session)
    beto = make_client(db_session, nombre="Beto", email="beto@example.com", marketing=False)
    otro = make_part(db_session, name="Bujía NGK", code="BUJ-001")
    part = make_part(db_session, price=1200)
    db_session.add_all([
        Favorite(client_id=ana.user_id, part_id=part.id),
        Favorite(client_id=beto.user_id, part_id=part.id),
        Favorite(client_id=beto.user_id, part_id=otro.id),
    ])
    db_session.commit()

    avisados = notificaciones.notificar_baja_de_precio(db_session, part, precio_anterior=1500)

    assert avisados == 1
    assert [m["To"] for m in mails] == ["ana@example.com"]
    assert "antes $ 1.500, ahora $ 1.200" in texto(mails[0])
    assert mails[0]["List-Unsubscribe"].startswith("<http")
    assert "No quiero recibir estos mails" in html(mails[0])


def test_si_el_precio_sube_o_queda_igual_no_avisa(db_session, mails):
    cliente = make_client(db_session)
    part = make_part(db_session, price=1500)
    db_session.add(Favorite(client_id=cliente.user_id, part_id=part.id))
    db_session.commit()

    assert notificaciones.notificar_baja_de_precio(db_session, part, precio_anterior=1500) == 0
    assert notificaciones.notificar_baja_de_precio(db_session, part, precio_anterior=1000) == 0
    assert mails == []


# =====================================================
# Carrito abandonado
# =====================================================


def test_carrito_abandonado_recibe_un_solo_recordatorio(db_session, mails):
    cliente = make_client(db_session)
    make_cart(db_session, cliente, [(make_part(db_session), 2)], actualizado=AHORA - timedelta(hours=25))

    primera = notificaciones.recordar_carritos_abandonados(db_session, AHORA)
    segunda = notificaciones.recordar_carritos_abandonados(db_session, AHORA + timedelta(days=1))

    assert (primera, segunda) == (1, 0)
    assert mails[0]["Subject"] == "Te quedó algo en el carrito"
    assert "2 x Aceite 10W-40 4L" in texto(mails[0])
    assert "/carrito" in texto(mails[0])
    assert mails[0]["List-Unsubscribe"]


def test_carrito_tocado_hace_menos_de_24_horas_no_recibe(db_session, mails):
    make_cart(db_session, make_client(db_session), [(make_part(db_session), 1)], actualizado=AHORA - timedelta(hours=23))

    assert notificaciones.recordar_carritos_abandonados(db_session, AHORA) == 0
    assert mails == []


def test_carrito_vacio_o_cliente_dado_de_baja_no_recibe(db_session, mails):
    make_cart(db_session, make_client(db_session), [], actualizado=AHORA - timedelta(days=3))
    baja = make_client(db_session, email="baja@example.com", marketing=False)
    make_cart(db_session, baja, [(make_part(db_session), 1)], actualizado=AHORA - timedelta(days=3))

    assert notificaciones.recordar_carritos_abandonados(db_session, AHORA) == 0
    assert mails == []


def test_si_vuelve_a_tocar_el_carrito_y_lo_abandona_recibe_otro(db_session, mails):
    cliente = make_client(db_session)
    part = make_part(db_session)
    make_cart(db_session, cliente, [(part, 1)], actualizado=AHORA - timedelta(hours=25))
    notificaciones.recordar_carritos_abandonados(db_session, AHORA)

    crud_cart.add_item(db_session, cliente.user_id, part.id, 1)
    cart = db_session.get(Cart, cliente.user_id)
    db_session.refresh(cart)
    tocado = notificaciones._como_utc(cart.updated_at)

    assert notificaciones.recordar_carritos_abandonados(db_session, tocado + timedelta(hours=1)) == 0
    assert notificaciones.recordar_carritos_abandonados(db_session, tocado + timedelta(hours=25)) == 1
    assert len(mails) == 2


# =====================================================
# Recordatorio de mantenimiento
# =====================================================


def test_recordatorio_cuando_se_cumple_el_plazo(db_session, mails):
    cliente = make_client(db_session)
    make_order(db_session, cliente, [(make_part(db_session), 1)], creado=AHORA - timedelta(days=186))

    primera = notificaciones.recordar_mantenimientos(db_session, AHORA)
    segunda = notificaciones.recordar_mantenimientos(db_session, AHORA + timedelta(days=2))

    assert (primera, segunda) == (1, 0)
    assert mails[0]["Subject"] == "¿Toca cambiar Aceite 10W-40 4L?"
    assert "hace 6 meses compraste Aceite 10W-40 4L" in texto(mails[0])
    assert mails[0]["List-Unsubscribe"]


def test_no_recuerda_antes_de_tiempo_ni_compras_viejas(db_session, mails):
    cliente = make_client(db_session)
    aceite = make_part(db_session)
    make_order(db_session, cliente, [(aceite, 1)], creado=AHORA - timedelta(days=120))
    make_order(db_session, cliente, [(aceite, 1)], creado=AHORA - timedelta(days=300))

    assert notificaciones.recordar_mantenimientos(db_session, AHORA) == 0
    assert mails == []


def test_cada_repuesto_tiene_su_plazo_y_algunos_ninguno(db_session, mails):
    cliente = make_client(db_session)
    bujia = make_part(db_session, name="Bujía NGK", code="BUJ-001")
    faro = make_part(db_session, name="Faro delantero", code="FAR-001")
    make_order(db_session, cliente, [(bujia, 4), (faro, 1)], creado=AHORA - timedelta(days=366))

    assert notificaciones.recordar_mantenimientos(db_session, AHORA) == 1
    assert "hace 12 meses compraste Bujía NGK" in texto(mails[0])


def test_pedido_cancelado_cliente_dado_de_baja_o_recompra_no_reciben(db_session, mails):
    ana = make_client(db_session)
    baja = make_client(db_session, email="baja@example.com", marketing=False)
    aceite = make_part(db_session)
    hace_seis_meses = AHORA - timedelta(days=186)
    make_order(db_session, ana, [(aceite, 1)], creado=hace_seis_meses, status=OrderStatus.CANCELLED)
    make_order(db_session, baja, [(aceite, 1)], creado=hace_seis_meses)
    recompra = make_client(db_session, email="recompra@example.com")
    make_order(db_session, recompra, [(aceite, 1)], creado=hace_seis_meses)
    make_order(db_session, recompra, [(aceite, 1)], creado=AHORA - timedelta(days=30))

    assert notificaciones.recordar_mantenimientos(db_session, AHORA) == 0
    assert mails == []


def test_sumar_meses_ajusta_el_fin_de_mes():
    assert notificaciones._sumar_meses(datetime(2026, 8, 31), 6) == datetime(2027, 2, 28)
    assert notificaciones._sumar_meses(datetime(2027, 8, 31), 6) == datetime(2028, 2, 29)
    assert notificaciones._sumar_meses(datetime(2026, 3, 15), -6) == datetime(2025, 9, 15)


def test_el_script_corre_las_dos_tareas(db_session, mails, monkeypatch, capsys):
    cliente = make_client(db_session)
    aceite = make_part(db_session)
    make_cart(db_session, cliente, [(aceite, 1)], actualizado=datetime.now(timezone.utc) - timedelta(days=2))
    make_order(db_session, cliente, [(aceite, 1)], creado=datetime.now(timezone.utc) - timedelta(days=186))
    monkeypatch.setattr(tareas_diarias, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    tareas_diarias.main()

    salida = capsys.readouterr().out
    assert "Carritos abandonados: 1 mail(s) enviado(s)." in salida
    assert "Recordatorios de mantenimiento: 1 mail(s) enviado(s)." in salida
    assert len(mails) == 2


# =====================================================
# Darse de baja y preferencias
# =====================================================


def test_el_enlace_del_mail_da_de_baja_sin_sesion(client, db_session, mails):
    cliente = make_client(db_session)
    make_cart(db_session, cliente, [(make_part(db_session), 1)], actualizado=AHORA - timedelta(days=2))
    notificaciones.recordar_carritos_abandonados(db_session, AHORA)
    token = re.search(r"baja-mails\?token=([\w.\-]+)", texto(mails[0])).group(1)

    response = client.post(UNSUBSCRIBE, json={"token": token})
    otra_vez = client.post(UNSUBSCRIBE, json={"token": token})

    assert response.status_code == otra_vez.status_code == 204
    db_session.refresh(cliente)
    assert cliente.marketing_emails is False


def test_enlace_de_baja_invalido(client, db_session):
    cliente = make_client(db_session)
    de_otro_proposito = create_purpose_token(str(cliente.user_id), "verify_email", 60)
    de_nadie = create_purpose_token("9999", DARSE_DE_BAJA, 60)

    for token in ("cualquier-cosa", de_otro_proposito, de_nadie):
        assert client.post(UNSUBSCRIBE, json={"token": token}).status_code == 400

    db_session.refresh(cliente)
    assert cliente.marketing_emails is True


def test_el_interruptor_del_perfil_cambia_la_preferencia(client, db_session):
    cliente = make_client(db_session)
    headers = auth_headers(cliente)

    apagado = client.put(PREFERENCES, headers=headers, json={"marketing_emails": False})
    assert apagado.status_code == 200
    assert apagado.json()["marketing_emails"] is False
    assert client.get(ME, headers=headers).json()["marketing_emails"] is False

    prendido = client.put(PREFERENCES, headers=headers, json={"marketing_emails": True})
    assert prendido.json()["marketing_emails"] is True


def test_preferencias_requiere_sesion_y_un_valor(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert client.put(PREFERENCES, json={"marketing_emails": False}).status_code == 401
    assert client.put(PREFERENCES, headers=headers, json={}).status_code == 422
