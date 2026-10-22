from app.core.security import create_access_token
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.order import Order
from app.models.part import Part
from app.models.payment_method import PaymentMethod
from app.models.shipping_address import ShippingAddress


def make_client(db_session, username="ana", email="ana@example.com"):
	cliente = Client(username=username, password="secret", name="Ana", email=email, email_verified=True)
	db_session.add(cliente)
	db_session.commit()
	db_session.refresh(cliente)
	return cliente


def make_part(db_session, **overrides):
	defaults = dict(
		part_code="BRK-001",
		name="Pastillas de freno",
		category="Brakes",
		price=1000,
		stock=5,
	)
	defaults.update(overrides)
	part = Part(**defaults)
	db_session.add(part)
	db_session.commit()
	db_session.refresh(part)
	return part


def make_address(db_session, cliente, **overrides):
	defaults = dict(
		personal_name="Ana",
		street="Av. Italia",
		number="1234",
		city="Montevideo",
		department="Montevideo",
		is_primary=True,
	)
	defaults.update(overrides)
	address = ShippingAddress(client_id=cliente.user_id, **defaults)
	db_session.add(address)
	db_session.commit()
	db_session.refresh(address)
	return address


def make_payment_method(db_session, cliente, last_four="1234", **overrides):
	defaults = dict(
		method=f"Visa •••• {last_four}",
		card_type="Visa",
		holder="Ana",
		last_four=last_four,
		expiry="12/30",
		is_primary=True,
	)
	defaults.update(overrides)
	method = PaymentMethod(client_id=cliente.user_id, **defaults)
	db_session.add(method)
	db_session.commit()
	db_session.refresh(method)
	return method


def make_cart(db_session, cliente, items=()):
	"""Arma el carrito directo en la base (sin pasar por /cart/items),
	así se puede dejar una cantidad mayor al stock para el caso 409.
	"""
	cart = Cart(client_id=cliente.user_id)
	db_session.add(cart)
	for part, amount in items:
		db_session.add(CartItem(cart_id=cliente.user_id, part_id=part.id, amount=amount))
	db_session.commit()
	return cart


def auth_headers(user, user_type="client"):
	token = create_access_token(
		subject=str(user.user_id), extra_claims={"user_type": user_type}
	)
	return {"Authorization": f"Bearer {token}"}


# =====================================================
# POST /api/v1/orders
# =====================================================


def test_confirm_order_creates_order_decreases_stock_and_clears_cart(client, db_session):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	pastillas = make_part(db_session, stock=5, price=1000)
	filtro = make_part(db_session, part_code="FLT-001", name="Filtro de aire", stock=4, price=3000)
	make_cart(db_session, cliente, [(pastillas, 2), (filtro, 1)])
	pastillas_id, filtro_id, cliente_id = pastillas.id, filtro.id, cliente.user_id

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 201
	body = response.json()
	assert isinstance(body["order_id"], int)
	assert body["total"] == 2 * 1000 + 1 * 3000

	db_session.expire_all()
	assert db_session.get(Part, pastillas_id).stock == 3
	assert db_session.get(Part, filtro_id).stock == 3
	assert db_session.query(CartItem).filter_by(cart_id=cliente_id).count() == 0
	assert db_session.get(Order, body["order_id"]) is not None


def test_confirm_order_sends_confirmation_email_with_detail_and_total(client, db_session, mails):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	pastillas = make_part(db_session, stock=5, price=1500)
	make_cart(db_session, cliente, [(pastillas, 2)])

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert len(mails) == 1
	assert mails[0]["To"] == "ana@example.com"
	assert mails[0]["Subject"] == f"Confirmamos tu pedido #{response.json()['order_id']}"
	texto = mails[0].get_body(preferencelist=("plain",)).get_content()
	assert "2 x Pastillas de freno: $ 3.000" in texto
	assert "Total: $ 3.000" in texto
	assert "Av. Italia 1234, Montevideo, Montevideo" in texto
	assert "Visa •••• 1234" in texto


def test_failed_order_sends_no_email(client, db_session, mails):
	cliente = make_client(db_session)
	make_cart(db_session, cliente)

	client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert mails == []


def test_confirm_order_with_insufficient_stock_returns_409_and_changes_nothing(client, db_session):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	filtro = make_part(db_session, part_code="FLT-001", name="Filtro de aire", stock=1)
	make_cart(db_session, cliente, [(filtro, 3)])
	filtro_id, cliente_id = filtro.id, cliente.user_id

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 409
	assert "Filtro de aire" in response.json()["detail"]

	db_session.expire_all()
	assert db_session.query(Order).count() == 0
	assert db_session.get(Part, filtro_id).stock == 1
	item = db_session.query(CartItem).filter_by(cart_id=cliente_id).one()
	assert item.part_id == filtro_id
	assert item.amount == 3


def test_confirm_order_with_empty_cart_returns_400(client, db_session):
	cliente = make_client(db_session)
	make_cart(db_session, cliente)

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 400


def test_confirm_order_requires_token(client):
	response = client.post("/api/v1/orders")

	assert response.status_code == 401


def test_confirm_order_with_unverified_email_returns_403_and_changes_nothing(client, db_session):
	cliente = make_client(db_session)
	cliente.email_verified = False
	db_session.commit()
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	pastillas = make_part(db_session, stock=5)
	make_cart(db_session, cliente, [(pastillas, 2)])
	pastillas_id = pastillas.id

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 403
	assert "Verificá tu correo" in response.json()["detail"]
	db_session.expire_all()
	assert db_session.get(Part, pastillas_id).stock == 5
	assert db_session.query(Order).count() == 0


# =====================================================
# Dirección de envío, método de pago y estado
# =====================================================


def test_confirm_order_with_own_address_and_payment_method(client, db_session):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	elegida = make_address(db_session, cliente, street="Bv. Artigas", number="99", is_primary=False)
	tarjeta = make_payment_method(db_session, cliente, last_four="9876", is_primary=False)
	pastillas = make_part(db_session)
	make_cart(db_session, cliente, [(pastillas, 1)])
	elegida_id, tarjeta_id = elegida.shipping_address_id, tarjeta.payment_method_id

	response = client.post(
		"/api/v1/orders",
		json={"shipping_address_id": elegida_id, "payment_method_id": tarjeta_id},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 201
	body = response.json()
	assert body["status"] == "confirmed"
	assert body["shipping_address"]["street"] == "Bv. Artigas"
	assert body["payment_method"] == "Visa •••• 9876"

	db_session.expire_all()
	order = db_session.get(Order, body["order_id"])
	assert order.shipping_address_id == elegida_id
	assert order.payment_method_id == tarjeta_id


def test_confirm_order_without_choice_uses_primary_address_and_payment_method(client, db_session):
	cliente = make_client(db_session)
	principal = make_address(db_session, cliente)
	make_address(db_session, cliente, street="Bv. Artigas", is_primary=False)
	tarjeta = make_payment_method(db_session, cliente)
	make_cart(db_session, cliente, [(make_part(db_session), 1)])
	principal_id, tarjeta_id = principal.shipping_address_id, tarjeta.payment_method_id

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 201
	order = db_session.get(Order, response.json()["order_id"])
	assert order.shipping_address_id == principal_id
	assert order.payment_method_id == tarjeta_id


def test_confirm_order_with_another_clients_address_is_rejected(client, db_session):
	cliente = make_client(db_session)
	otro = make_client(db_session, username="beto", email="beto@example.com")
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	ajena = make_address(db_session, otro)
	pastillas = make_part(db_session, stock=5)
	make_cart(db_session, cliente, [(pastillas, 2)])
	ajena_id, pastillas_id, cliente_id = ajena.shipping_address_id, pastillas.id, cliente.user_id

	response = client.post(
		"/api/v1/orders",
		json={"shipping_address_id": ajena_id},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 422
	db_session.expire_all()
	assert db_session.query(Order).count() == 0
	assert db_session.get(Part, pastillas_id).stock == 5
	assert db_session.query(CartItem).filter_by(cart_id=cliente_id).count() == 1


def test_confirm_order_with_another_clients_payment_method_is_rejected(client, db_session):
	cliente = make_client(db_session)
	otro = make_client(db_session, username="beto", email="beto@example.com")
	make_address(db_session, cliente)
	make_payment_method(db_session, cliente)
	ajena = make_payment_method(db_session, otro, last_four="5555")
	make_cart(db_session, cliente, [(make_part(db_session), 1)])

	response = client.post(
		"/api/v1/orders",
		json={"payment_method_id": ajena.payment_method_id},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 422
	assert db_session.query(Order).count() == 0


def test_confirm_order_without_saved_address_returns_400(client, db_session):
	cliente = make_client(db_session)
	make_payment_method(db_session, cliente)
	make_cart(db_session, cliente, [(make_part(db_session), 1)])

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 400
	assert "dirección" in response.json()["detail"]
	assert db_session.query(Order).count() == 0


def test_confirm_order_without_saved_payment_method_returns_400(client, db_session):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	make_cart(db_session, cliente, [(make_part(db_session), 1)])

	response = client.post("/api/v1/orders", headers=auth_headers(cliente))

	assert response.status_code == 400
	assert "método de pago" in response.json()["detail"]


def test_order_keeps_address_and_payment_after_they_are_deleted(client, db_session):
	cliente = make_client(db_session)
	address = make_address(db_session, cliente)
	method = make_payment_method(db_session, cliente)
	make_cart(db_session, cliente, [(make_part(db_session), 1)])
	headers = auth_headers(cliente)
	address_id, method_id = address.shipping_address_id, method.payment_method_id
	order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]

	assert client.delete(f"/api/v1/addresses/{address_id}", headers=headers).status_code == 204
	assert client.delete(f"/api/v1/payment-methods/{method_id}", headers=headers).status_code == 204

	response = client.get(f"/api/v1/orders/{order_id}", headers=headers)
	assert response.status_code == 200
	assert response.json()["shipping_address"]["street"] == "Av. Italia"
	assert response.json()["payment_method"] == "Visa •••• 1234"


def test_confirm_order_with_expired_card_returns_422(client, db_session):
	cliente = make_client(db_session)
	make_address(db_session, cliente)
	vencida = make_payment_method(db_session, cliente, expiry="01/20")
	make_cart(db_session, cliente, [(make_part(db_session), 1)])
	vencida_id = vencida.payment_method_id

	# Tanto eligiéndola como usándola por ser la principal.
	for body in ({"payment_method_id": vencida_id}, {}):
		response = client.post("/api/v1/orders", json=body, headers=auth_headers(cliente))

		assert response.status_code == 422
		assert "vencida" in response.json()["detail"]
	assert db_session.query(Order).count() == 0
