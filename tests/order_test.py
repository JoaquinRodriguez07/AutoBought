"""Tests de la confirmación de la compra."""

from app.core.security import create_access_token
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.order import Order
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress


def make_client(db_session, username="ana", email="ana@example.com"):
	customer = Client(username=username, password="secret", name="Ana", email=email, email_verified=True)
	db_session.add(customer)
	db_session.commit()
	db_session.refresh(customer)
	return customer


def make_part(db_session, **overrides):
	defaults = dict(
		part_code="BRK-001",
		name="Pastillas de freno",
		manufacturer="Bosch",
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


def make_address(db_session, customer, **overrides):
	defaults = dict(
		personal_name="Ana",
		street="Av. Italia",
		number="1234",
		city="Montevideo",
		department="Montevideo",
		is_primary=True,
	)
	defaults.update(overrides)
	address = ShippingAddress(client_id=customer.user_id, **defaults)
	db_session.add(address)
	db_session.commit()
	db_session.refresh(address)
	return address


def make_cart(db_session, customer, items=()):
	"""Arma el carrito directo en la base (sin pasar por /cart/items),
	así se puede dejar una cantidad mayor al stock para el caso 409.
	"""
	cart = Cart(client_id=customer.user_id)
	db_session.add(cart)
	for part, amount in items:
		db_session.add(CartItem(cart_id=customer.user_id, part_id=part.id, amount=amount))
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
	customer = make_client(db_session)
	make_address(db_session, customer)
	brake_pads = make_part(db_session, stock=5, price=1000)
	filter_part = make_part(db_session, part_code="FLT-001", name="Filtro de aire", stock=4, price=3000)
	make_cart(db_session, customer, [(brake_pads, 2), (filter_part, 1)])
	pastillas_id, filter_id, customer_id = brake_pads.id, filter_part.id, customer.user_id

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 201
	body = response.json()
	assert isinstance(body["order_id"], int)
	assert body["total"] == 2 * 1000 + 1 * 3000

	db_session.expire_all()
	assert db_session.get(Part, pastillas_id).stock == 3
	assert db_session.get(Part, filter_id).stock == 3
	assert db_session.query(CartItem).filter_by(cart_id=customer_id).count() == 0
	assert db_session.get(Order, body["order_id"]) is not None


def test_confirm_order_creates_pending_payment_and_sends_no_email_yet(client, db_session, sent_mails):
	customer = make_client(db_session)
	make_address(db_session, customer)
	make_cart(db_session, customer, [(make_part(db_session), 1)])

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 201
	body = response.json()
	assert body["payment_method"] == "Mercado Pago"
	assert body["payment_status"] == "pending"
	payment = db_session.query(Payment).one()
	assert payment.order_id == body["order_id"]
	assert payment.status == PaymentStatus.PENDING
	# El mail de la compra sale cuando Mercado Pago aprueba el pago.
	assert sent_mails == []


def test_failed_order_sends_no_email(client, db_session, sent_mails):
	customer = make_client(db_session)
	make_cart(db_session, customer)

	client.post("/api/v1/orders", headers=auth_headers(customer))

	assert sent_mails == []


def test_confirm_order_with_insufficient_stock_returns_409_and_changes_nothing(client, db_session):
	customer = make_client(db_session)
	make_address(db_session, customer)
	filter_part = make_part(db_session, part_code="FLT-001", name="Filtro de aire", stock=1)
	make_cart(db_session, customer, [(filter_part, 3)])
	filter_id, customer_id = filter_part.id, customer.user_id

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 409
	assert "Filtro de aire" in response.json()["detail"]

	db_session.expire_all()
	assert db_session.query(Order).count() == 0
	assert db_session.get(Part, filter_id).stock == 1
	item = db_session.query(CartItem).filter_by(cart_id=customer_id).one()
	assert item.part_id == filter_id
	assert item.amount == 3


def test_confirm_order_with_empty_cart_returns_400(client, db_session):
	customer = make_client(db_session)
	make_cart(db_session, customer)

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 400


def test_confirm_order_requires_token(client):
	response = client.post("/api/v1/orders")

	assert response.status_code == 401


def test_confirm_order_with_unverified_email_returns_403_and_changes_nothing(client, db_session):
	customer = make_client(db_session)
	customer.email_verified = False
	db_session.commit()
	make_address(db_session, customer)
	brake_pads = make_part(db_session, stock=5)
	make_cart(db_session, customer, [(brake_pads, 2)])
	pastillas_id = brake_pads.id

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 403
	assert "Verificá tu correo" in response.json()["detail"]
	db_session.expire_all()
	assert db_session.get(Part, pastillas_id).stock == 5
	assert db_session.query(Order).count() == 0


# =====================================================
# Dirección de envío y estado
# =====================================================


def test_confirm_order_with_own_address(client, db_session):
	customer = make_client(db_session)
	make_address(db_session, customer)
	chosen = make_address(db_session, customer, street="Bv. Artigas", number="99", is_primary=False)
	brake_pads = make_part(db_session)
	make_cart(db_session, customer, [(brake_pads, 1)])
	chosen_id = chosen.shipping_address_id

	response = client.post(
		"/api/v1/orders",
		json={"shipping_address_id": chosen_id},
		headers=auth_headers(customer),
	)

	assert response.status_code == 201
	body = response.json()
	assert body["status"] == "confirmed"
	assert body["shipping_address"]["street"] == "Bv. Artigas"

	db_session.expire_all()
	order = db_session.get(Order, body["order_id"])
	assert order.shipping_address_id == chosen_id


def test_confirm_order_without_choice_uses_primary_address(client, db_session):
	customer = make_client(db_session)
	primary = make_address(db_session, customer)
	make_address(db_session, customer, street="Bv. Artigas", is_primary=False)
	make_cart(db_session, customer, [(make_part(db_session), 1)])
	primary_id = primary.shipping_address_id

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 201
	order = db_session.get(Order, response.json()["order_id"])
	assert order.shipping_address_id == primary_id


def test_confirm_order_with_another_clients_address_is_rejected(client, db_session):
	customer = make_client(db_session)
	other = make_client(db_session, username="beto", email="beto@example.com")
	make_address(db_session, customer)
	ajena = make_address(db_session, other)
	brake_pads = make_part(db_session, stock=5)
	make_cart(db_session, customer, [(brake_pads, 2)])
	ajena_id, pastillas_id, customer_id = ajena.shipping_address_id, brake_pads.id, customer.user_id

	response = client.post(
		"/api/v1/orders",
		json={"shipping_address_id": ajena_id},
		headers=auth_headers(customer),
	)

	assert response.status_code == 422
	db_session.expire_all()
	assert db_session.query(Order).count() == 0
	assert db_session.get(Part, pastillas_id).stock == 5
	assert db_session.query(CartItem).filter_by(cart_id=customer_id).count() == 1


def test_confirm_order_without_saved_address_returns_400(client, db_session):
	customer = make_client(db_session)
	make_cart(db_session, customer, [(make_part(db_session), 1)])

	response = client.post("/api/v1/orders", headers=auth_headers(customer))

	assert response.status_code == 400
	assert "dirección" in response.json()["detail"]
	assert db_session.query(Order).count() == 0


def test_order_keeps_address_after_it_is_deleted(client, db_session):
	customer = make_client(db_session)
	address = make_address(db_session, customer)
	make_cart(db_session, customer, [(make_part(db_session), 1)])
	headers = auth_headers(customer)
	address_id = address.shipping_address_id
	order_id = client.post("/api/v1/orders", headers=headers).json()["order_id"]

	assert client.delete(f"/api/v1/addresses/{address_id}", headers=headers).status_code == 204

	response = client.get(f"/api/v1/orders/{order_id}", headers=headers)
	assert response.status_code == 200
	assert response.json()["shipping_address"]["street"] == "Av. Italia"
