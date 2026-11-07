import re
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks

from app.core import notifications
from app.core.security import UNSUBSCRIBE_PURPOSE, create_access_token, create_purpose_token
from app.crud import cart as crud_cart
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.stock_alert import StockAlert
from scripts import daily_tasks

AHORA = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

PREFERENCES = "/api/v1/auth/me/preferences"
UNSUBSCRIBE = "/api/v1/auth/unsubscribe"
ME = "/api/v1/auth/me"


def make_client(db, name_value="Ana", email="ana@example.com", marketing=True):
    customer = Client(
        username=email.split("@")[0], password="secret", name=name_value, email=email,
        email_verified=True, marketing_emails=marketing,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def make_part(db, name="Aceite 10W-40 4L", price=1500, stock=5, code="ACE-001", manufacturer="Bosch"):
    part = Part(part_code=code, name=name, manufacturer=manufacturer, category="Lubricantes", price=price, stock=stock)
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


def make_order(db, customer, items, created=AHORA, status=OrderStatus.CONFIRMED):
    order = Order(
        client_id=customer.user_id, created_at=created, status=status,
        ship_personal_name="Casa", ship_street="Av. Italia", ship_number="1234", ship_apartment="301",
        ship_city="Montevideo", ship_department="Montevideo", payment_method_label="Visa •••• 1234",
    )
    db.add(order)
    db.flush()
    for part, qty in items:
        db.add(OrderItem(order_id=order.order_id, part_id=part.id, quantity=qty, frozen_price=part.price))
    db.commit()
    db.refresh(order)
    return order


def make_cart(db, customer, items, updated):
    db.add(Cart(client_id=customer.user_id, updated_at=updated))
    for part, qty in items:
        db.add(CartItem(cart_id=customer.user_id, part_id=part.id, amount=qty))
    db.commit()


def auth_headers(user):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": "client"})
    return {"Authorization": f"Bearer {token}"}


def texto(msg):
    return msg.get_body(preferencelist=("plain",)).get_content()


def html(msg):
    return msg.get_body(preferencelist=("html",)).get_content()


# =====================================================
# Pedidos
# =====================================================


def test_cambio_a_enviado_y_entregado(db_session, sent_mails):
    customer = make_client(db_session)
    order = make_order(db_session, customer, [(make_part(db_session), 2)])

    order.status = OrderStatus.SHIPPED
    notifications.notify_status_change(order)
    order.status = OrderStatus.DELIVERED
    notifications.notify_status_change(order)

    assert [m["Subject"] for m in sent_mails] == [
        f"Tu pedido #{order.order_id} fue enviado",
        f"Tu pedido #{order.order_id} fue entregado",
    ]
    assert "Ya está en camino" in texto(sent_mails[0])
    assert "2 x Aceite 10W-40 4L: $ 3.000" in texto(sent_mails[0])
    assert "Av. Italia 1234, apto. 301, Montevideo, Montevideo" in texto(sent_mails[0])
    assert "/historial" in texto(sent_mails[1])


def test_cancelacion_usa_su_propio_mail(db_session, sent_mails):
    customer = make_client(db_session)
    order = make_order(db_session, customer, [(make_part(db_session), 1)], status=OrderStatus.CANCELLED)

    notifications.notify_status_change(order)

    assert len(sent_mails) == 1
    assert sent_mails[0]["Subject"] == f"Cancelamos tu pedido #{order.order_id}"
    assert "quedó cancelado" in texto(sent_mails[0])


def test_confirmado_no_manda_otro_mail(db_session, sent_mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])

    notifications.notify_status_change(order)

    assert sent_mails == []


def test_desde_un_endpoint_se_manda_despues_de_responder(db_session, sent_mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])
    tasks = BackgroundTasks()

    notifications.notify_purchase(order, tasks)

    assert sent_mails == []
    assert len(tasks.tasks) == 1


def test_los_mails_de_pedidos_no_traen_enlace_de_baja(db_session, sent_mails):
    order = make_order(db_session, make_client(db_session), [(make_part(db_session), 1)])

    notifications.notify_purchase(order)

    assert "List-Unsubscribe" not in sent_mails[0]
    assert "No quiero recibir estos mails" not in html(sent_mails[0])


# =====================================================
# Vuelta de stock
# =====================================================


def test_vuelta_de_stock_avisa_una_vez_a_los_suscritos(db_session, sent_mails):
    ana = make_client(db_session)
    beto = make_client(db_session, name_value="Beto", email="beto@example.com", marketing=False)
    part = make_part(db_session, name="Faro delantero", stock=0, price=8900)
    db_session.add_all([StockAlert(client_id=ana.user_id, part_id=part.id), StockAlert(client_id=beto.user_id, part_id=part.id)])
    db_session.commit()

    part.stock = 3
    notified = notifications.notify_back_in_stock(db_session, part, previous_stock=0)

    # La suscripción la pidió el cliente: le llega aunque esté dado de baja de los comerciales.
    assert notified == 2
    assert sorted(m["To"] for m in sent_mails) == ["ana@example.com", "beto@example.com"]
    assert "Faro delantero — $ 8.900" in texto(sent_mails[0])
    assert "/catalogo?q=Faro%20delantero" in texto(sent_mails[0])
    assert db_session.query(StockAlert).count() == 0

    assert notifications.notify_back_in_stock(db_session, part, previous_stock=0) == 0
    assert len(sent_mails) == 2


def test_si_ya_habia_stock_o_sigue_sin_haber_no_avisa(db_session, sent_mails):
    customer = make_client(db_session)
    part = make_part(db_session, stock=0)
    db_session.add(StockAlert(client_id=customer.user_id, part_id=part.id))
    db_session.commit()

    still_sold_out = notifications.notify_back_in_stock(db_session, part, previous_stock=0)
    part.stock = 8
    ya_habia = notifications.notify_back_in_stock(db_session, part, previous_stock=5)

    assert still_sold_out == ya_habia == 0
    assert sent_mails == []
    assert db_session.query(StockAlert).count() == 1


# =====================================================
# Baja de precio
# =====================================================


def test_baja_de_precio_avisa_a_los_favoritos_que_no_se_dieron_de_baja(db_session, sent_mails):
    ana = make_client(db_session)
    beto = make_client(db_session, name_value="Beto", email="beto@example.com", marketing=False)
    other = make_part(db_session, name="Bujía NGK", code="BUJ-001")
    part = make_part(db_session, price=1200)
    db_session.add_all([
        Favorite(client_id=ana.user_id, part_id=part.id),
        Favorite(client_id=beto.user_id, part_id=part.id),
        Favorite(client_id=beto.user_id, part_id=other.id),
    ])
    db_session.commit()

    notified = notifications.notify_price_drop(db_session, part, previous_price=1500)

    assert notified == 1
    assert [m["To"] for m in sent_mails] == ["ana@example.com"]
    assert "antes $ 1.500, ahora $ 1.200" in texto(sent_mails[0])
    assert sent_mails[0]["List-Unsubscribe"].startswith("<http")
    assert "No quiero recibir estos mails" in html(sent_mails[0])


def test_si_el_precio_sube_o_queda_igual_no_avisa(db_session, sent_mails):
    customer = make_client(db_session)
    part = make_part(db_session, price=1500)
    db_session.add(Favorite(client_id=customer.user_id, part_id=part.id))
    db_session.commit()

    assert notifications.notify_price_drop(db_session, part, previous_price=1500) == 0
    assert notifications.notify_price_drop(db_session, part, previous_price=1000) == 0
    assert sent_mails == []


# =====================================================
# Carrito abandonado
# =====================================================


def test_carrito_abandonado_recibe_un_solo_recordatorio(db_session, sent_mails):
    customer = make_client(db_session)
    make_cart(db_session, customer, [(make_part(db_session), 2)], updated=AHORA - timedelta(hours=25))

    primera = notifications.remind_abandoned_carts(db_session, AHORA)
    segunda = notifications.remind_abandoned_carts(db_session, AHORA + timedelta(days=1))

    assert (primera, segunda) == (1, 0)
    assert sent_mails[0]["Subject"] == "Te quedó algo en el carrito"
    assert "2 x Aceite 10W-40 4L" in texto(sent_mails[0])
    assert "/carrito" in texto(sent_mails[0])
    assert sent_mails[0]["List-Unsubscribe"]


def test_carrito_tocado_hace_menos_de_24_horas_no_recibe(db_session, sent_mails):
    make_cart(db_session, make_client(db_session), [(make_part(db_session), 1)], updated=AHORA - timedelta(hours=23))

    assert notifications.remind_abandoned_carts(db_session, AHORA) == 0
    assert sent_mails == []


def test_carrito_vacio_o_cliente_dado_de_baja_no_recibe(db_session, sent_mails):
    make_cart(db_session, make_client(db_session), [], updated=AHORA - timedelta(days=3))
    baja = make_client(db_session, email="baja@example.com", marketing=False)
    make_cart(db_session, baja, [(make_part(db_session), 1)], updated=AHORA - timedelta(days=3))

    assert notifications.remind_abandoned_carts(db_session, AHORA) == 0
    assert sent_mails == []


def test_si_vuelve_a_tocar_el_carrito_y_lo_abandona_recibe_otro(db_session, sent_mails):
    customer = make_client(db_session)
    part = make_part(db_session)
    make_cart(db_session, customer, [(part, 1)], updated=AHORA - timedelta(hours=25))
    notifications.remind_abandoned_carts(db_session, AHORA)

    crud_cart.add_item(db_session, customer.user_id, part.id, 1)
    cart = db_session.get(Cart, customer.user_id)
    db_session.refresh(cart)
    touched = notifications._como_utc(cart.updated_at)

    assert notifications.remind_abandoned_carts(db_session, touched + timedelta(hours=1)) == 0
    assert notifications.remind_abandoned_carts(db_session, touched + timedelta(hours=25)) == 1
    assert len(sent_mails) == 2


# =====================================================
# Recordatorio de mantenimiento
# =====================================================


def test_recordatorio_cuando_se_cumple_el_plazo(db_session, sent_mails):
    customer = make_client(db_session)
    make_order(db_session, customer, [(make_part(db_session), 1)], created=AHORA - timedelta(days=186))

    primera = notifications.remind_maintenance(db_session, AHORA)
    segunda = notifications.remind_maintenance(db_session, AHORA + timedelta(days=2))

    assert (primera, segunda) == (1, 0)
    assert sent_mails[0]["Subject"] == "¿Toca cambiar Aceite 10W-40 4L?"
    assert "hace 6 meses compraste Aceite 10W-40 4L" in texto(sent_mails[0])
    assert sent_mails[0]["List-Unsubscribe"]


def test_no_recuerda_antes_de_tiempo_ni_compras_viejas(db_session, sent_mails):
    customer = make_client(db_session)
    aceite = make_part(db_session)
    make_order(db_session, customer, [(aceite, 1)], created=AHORA - timedelta(days=120))
    make_order(db_session, customer, [(aceite, 1)], created=AHORA - timedelta(days=300))

    assert notifications.remind_maintenance(db_session, AHORA) == 0
    assert sent_mails == []


def test_cada_repuesto_tiene_su_plazo_y_algunos_ninguno(db_session, sent_mails):
    customer = make_client(db_session)
    bujia = make_part(db_session, name="Bujía NGK", code="BUJ-001")
    faro = make_part(db_session, name="Faro delantero", code="FAR-001")
    make_order(db_session, customer, [(bujia, 4), (faro, 1)], created=AHORA - timedelta(days=366))

    assert notifications.remind_maintenance(db_session, AHORA) == 1
    assert "hace 12 meses compraste Bujía NGK" in texto(sent_mails[0])


def test_pedido_cancelado_cliente_dado_de_baja_o_recompra_no_reciben(db_session, sent_mails):
    ana = make_client(db_session)
    baja = make_client(db_session, email="baja@example.com", marketing=False)
    aceite = make_part(db_session)
    six_months_ago = AHORA - timedelta(days=186)
    make_order(db_session, ana, [(aceite, 1)], created=six_months_ago, status=OrderStatus.CANCELLED)
    make_order(db_session, baja, [(aceite, 1)], created=six_months_ago)
    recompra = make_client(db_session, email="recompra@example.com")
    make_order(db_session, recompra, [(aceite, 1)], created=six_months_ago)
    make_order(db_session, recompra, [(aceite, 1)], created=AHORA - timedelta(days=30))

    assert notifications.remind_maintenance(db_session, AHORA) == 0
    assert sent_mails == []


def test_pedido_sin_pagar_no_recibe_recordatorio_ni_cuenta_como_recompra(db_session, sent_mails):
    unpaid = make_client(db_session)
    aceite = make_part(db_session)
    six_months_ago = AHORA - timedelta(days=186)
    order_data = make_order(db_session, unpaid, [(aceite, 1)], created=six_months_ago)
    db_session.add(Payment(order_id=order_data.order_id, status=PaymentStatus.PENDING))
    # Pagó hace 6 meses y hace poco dejó un pedido sin pagar: le toca igual.
    payment_data = make_client(db_session, email="pago@example.com")
    make_order(db_session, payment_data, [(aceite, 1)], created=six_months_ago)
    reciente = make_order(db_session, payment_data, [(aceite, 1)], created=AHORA - timedelta(days=30))
    db_session.add(Payment(order_id=reciente.order_id, status=PaymentStatus.REJECTED))
    db_session.commit()

    assert notifications.remind_maintenance(db_session, AHORA) == 1
    assert sent_mails[0]["To"] == "pago@example.com"


def test_recomprar_el_mismo_repuesto_de_otro_fabricante_cuenta_como_recompra(db_session, sent_mails):
    customer = make_client(db_session)
    castrol = make_part(db_session, name="Aceite Castrol 10W-40 4L", manufacturer="Castrol")
    mobil = make_part(db_session, name="Aceite Mobil 10W-40 4L", manufacturer="Mobil", code="ACE-002")
    make_order(db_session, customer, [(castrol, 1)], created=AHORA - timedelta(days=186))
    make_order(db_session, customer, [(mobil, 1)], created=AHORA - timedelta(days=30))

    assert notifications.remind_maintenance(db_session, AHORA) == 0


def test_sumar_meses_ajusta_el_fin_de_mes():
    assert notifications._add_months(datetime(2026, 8, 31), 6) == datetime(2027, 2, 28)
    assert notifications._add_months(datetime(2027, 8, 31), 6) == datetime(2028, 2, 29)
    assert notifications._add_months(datetime(2026, 3, 15), -6) == datetime(2025, 9, 15)


def test_el_script_corre_las_dos_tareas(db_session, sent_mails, monkeypatch, capsys):
    customer = make_client(db_session)
    aceite = make_part(db_session)
    make_cart(db_session, customer, [(aceite, 1)], updated=datetime.now(timezone.utc) - timedelta(days=2))
    make_order(db_session, customer, [(aceite, 1)], created=datetime.now(timezone.utc) - timedelta(days=186))
    monkeypatch.setattr(daily_tasks, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    daily_tasks.main()

    output = capsys.readouterr().out
    assert "Carritos abandonados: 1 mail(s) enviado(s)." in output
    assert "Recordatorios de mantenimiento: 1 mail(s) enviado(s)." in output
    assert len(sent_mails) == 2



def smtp_down(monkeypatch):
    def fallar(msg):
        raise OSError("SMTP caído")
    monkeypatch.setattr("app.core.email._send_smtp", fallar)


def test_si_falla_el_mail_del_carrito_se_reintenta_al_otro_dia(db_session, sent_mails, monkeypatch):
    customer = make_client(db_session)
    make_cart(db_session, customer, [(make_part(db_session), 1)], updated=AHORA - timedelta(hours=25))
    smtp_down(monkeypatch)

    assert notifications.remind_abandoned_carts(db_session, AHORA) == 0
    monkeypatch.setattr("app.core.email._send_smtp", sent_mails.append)
    assert notifications.remind_abandoned_carts(db_session, AHORA + timedelta(days=1)) == 1
    assert len(sent_mails) == 1


def test_si_falla_el_mail_de_mantenimiento_se_reintenta_al_otro_dia(db_session, sent_mails, monkeypatch):
    customer = make_client(db_session)
    make_order(db_session, customer, [(make_part(db_session), 1)], created=AHORA - timedelta(days=186))
    smtp_down(monkeypatch)

    assert notifications.remind_maintenance(db_session, AHORA) == 0
    monkeypatch.setattr("app.core.email._send_smtp", sent_mails.append)
    assert notifications.remind_maintenance(db_session, AHORA + timedelta(days=1)) == 1
    assert len(sent_mails) == 1


TAREAS = "/api/v1/tareas/diarias"


def test_vercel_cron_corre_las_tareas_con_el_secreto(client, db_session, sent_mails, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.tasks.CRON_SECRET", "secreto")
    customer = make_client(db_session)
    make_cart(db_session, customer, [(make_part(db_session), 1)], updated=datetime.now(timezone.utc) - timedelta(days=2))

    reply = client.get(TAREAS, headers={"Authorization": "Bearer secreto"})

    assert reply.status_code == 200
    assert reply.json() == {
        "Carritos abandonados": 1,
        "Recordatorios de mantenimiento": 0,
        "Pedidos vencidos cancelados": 0,
        "Devoluciones hechas": 0,
    }
    assert len(sent_mails) == 1


def test_tareas_diarias_sin_el_secreto_no_corren(client, db_session, sent_mails, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.tasks.CRON_SECRET", "secreto")
    assert client.get(TAREAS).status_code == 401
    assert client.get(TAREAS, headers={"Authorization": "Bearer otro"}).status_code == 401

    monkeypatch.setattr("app.api.v1.endpoints.tasks.CRON_SECRET", "")
    assert client.get(TAREAS, headers={"Authorization": "Bearer "}).status_code == 401
    assert sent_mails == []

# =====================================================
# Darse de baja y preferencias
# =====================================================


def test_el_enlace_del_mail_da_de_baja_sin_sesion(client, db_session, sent_mails):
    customer = make_client(db_session)
    make_cart(db_session, customer, [(make_part(db_session), 1)], updated=AHORA - timedelta(days=2))
    notifications.remind_abandoned_carts(db_session, AHORA)
    token = re.search(r"baja-mails\?token=([\w.\-]+)", texto(sent_mails[0])).group(1)

    response = client.post(UNSUBSCRIBE, json={"token": token})
    again = client.post(UNSUBSCRIBE, json={"token": token})

    assert response.status_code == again.status_code == 204
    db_session.refresh(customer)
    assert customer.marketing_emails is False


def test_enlace_de_baja_invalido(client, db_session):
    customer = make_client(db_session)
    of_other_purpose = create_purpose_token(str(customer.user_id), "verify_email", 60)
    de_nadie = create_purpose_token("9999", UNSUBSCRIBE_PURPOSE, 60)

    for token in ("cualquier-cosa", of_other_purpose, de_nadie):
        assert client.post(UNSUBSCRIBE, json={"token": token}).status_code == 400

    db_session.refresh(customer)
    assert customer.marketing_emails is True


def test_el_interruptor_del_perfil_cambia_la_preferencia(client, db_session):
    customer = make_client(db_session)
    headers = auth_headers(customer)

    off = client.put(PREFERENCES, headers=headers, json={"marketing_emails": False})
    assert off.status_code == 200
    assert off.json()["marketing_emails"] is False
    assert client.get(ME, headers=headers).json()["marketing_emails"] is False

    on = client.put(PREFERENCES, headers=headers, json={"marketing_emails": True})
    assert on.json()["marketing_emails"] is True


def test_preferencias_requiere_sesion_y_un_valor(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert client.put(PREFERENCES, json={"marketing_emails": False}).status_code == 401
    assert client.put(PREFERENCES, headers=headers, json={}).status_code == 422
