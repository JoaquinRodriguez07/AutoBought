from app.core.security import create_access_token
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.order import Order
from app.models.part import Part


def make_client(db_session, username="ana", email="ana@example.com"):
	cliente = Client(username=username, password="secret", name="Ana", email=email)
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


def test_confirm_order_with_insufficient_stock_returns_409_and_changes_nothing(client, db_session):
	cliente = make_client(db_session)
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
