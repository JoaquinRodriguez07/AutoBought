from app.core.security import create_access_token
from app.models.client import Client
from app.models.employee import Employee
from app.models.part import Part


def make_client(db_session, username="ana", email="ana@example.com"):
	cliente = Client(username=username, password="secret", name="Ana", email=email)
	db_session.add(cliente)
	db_session.commit()
	db_session.refresh(cliente)
	return cliente


def make_employee(db_session, username="empleado", email="empleado@example.com"):
	empleado = Employee(username=username, password="secret", name="Empleado", email=email)
	db_session.add(empleado)
	db_session.commit()
	db_session.refresh(empleado)
	return empleado


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


def auth_headers(user, user_type="client"):
	token = create_access_token(
		subject=str(user.user_id), extra_claims={"user_type": user_type}
	)
	return {"Authorization": f"Bearer {token}"}


# =====================================================
# GET /api/v1/cart
# =====================================================


def test_get_cart_creates_empty_cart_for_new_client(client, db_session):
	cliente = make_client(db_session)

	response = client.get("/api/v1/cart", headers=auth_headers(cliente))

	assert response.status_code == 200
	body = response.json()
	assert body["client_id"] == cliente.user_id
	assert body["items"] == []
	assert body["total"] == 0


def test_cart_requires_token(client):
	response = client.get("/api/v1/cart")

	assert response.status_code == 401


def test_cart_rejects_employee(client, db_session):
	empleado = make_employee(db_session)

	response = client.get(
		"/api/v1/cart", headers=auth_headers(empleado, user_type="employee")
	)

	assert response.status_code == 403


# =====================================================
# POST /api/v1/cart/items
# =====================================================


def test_add_item_to_cart(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)

	response = client.post(
		"/api/v1/cart/items",
		json={"part_id": part.id, "amount": 2},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 200
	body = response.json()
	assert len(body["items"]) == 1
	item = body["items"][0]
	assert item["part_id"] == part.id
	assert item["amount"] == 2
	assert item["subtotal"] == 2000
	assert item["stock"] == 5
	assert item["category"] == "Brakes"
	assert body["total"] == 2000


def test_add_item_twice_sums_amount(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, stock=10)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 2}, headers=headers
	)
	response = client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 3}, headers=headers
	)

	assert response.status_code == 200
	body = response.json()
	assert len(body["items"]) == 1
	assert body["items"][0]["amount"] == 5


def test_add_item_exceeding_stock_returns_409(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, stock=3)

	response = client.post(
		"/api/v1/cart/items",
		json={"part_id": part.id, "amount": 4},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 409


def test_add_item_exceeding_stock_after_existing_amount_returns_409(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, stock=3)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 2}, headers=headers
	)
	response = client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 2}, headers=headers
	)

	assert response.status_code == 409
	# el stock insuficiente no debe modificar lo que ya había en el carrito
	cart = client.get("/api/v1/cart", headers=headers).json()
	assert cart["items"][0]["amount"] == 2


def test_add_item_invalid_amount_returns_422(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)

	response = client.post(
		"/api/v1/cart/items",
		json={"part_id": part.id, "amount": 0},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 422


def test_add_nonexistent_part_returns_404(client, db_session):
	cliente = make_client(db_session)

	response = client.post(
		"/api/v1/cart/items",
		json={"part_id": 999999, "amount": 1},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 404


# =====================================================
# PATCH /api/v1/cart/items/{part_id}
# =====================================================


def test_update_item_quantity(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, stock=10)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 2}, headers=headers
	)
	response = client.patch(
		f"/api/v1/cart/items/{part.id}", json={"amount": 5}, headers=headers
	)

	assert response.status_code == 200
	assert response.json()["items"][0]["amount"] == 5


def test_update_item_exceeding_stock_returns_409(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, stock=3)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 1}, headers=headers
	)
	response = client.patch(
		f"/api/v1/cart/items/{part.id}", json={"amount": 10}, headers=headers
	)

	assert response.status_code == 409


def test_update_item_invalid_amount_returns_422(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 1}, headers=headers
	)
	response = client.patch(
		f"/api/v1/cart/items/{part.id}", json={"amount": 0}, headers=headers
	)

	assert response.status_code == 422


def test_update_item_not_in_cart_returns_404(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)

	response = client.patch(
		f"/api/v1/cart/items/{part.id}",
		json={"amount": 1},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 404


def test_update_nonexistent_part_returns_404(client, db_session):
	cliente = make_client(db_session)

	response = client.patch(
		"/api/v1/cart/items/999999",
		json={"amount": 1},
		headers=auth_headers(cliente),
	)

	assert response.status_code == 404


# =====================================================
# DELETE /api/v1/cart/items/{part_id} y DELETE /api/v1/cart
# =====================================================


def test_remove_item(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 1}, headers=headers
	)
	response = client.delete(f"/api/v1/cart/items/{part.id}", headers=headers)

	assert response.status_code == 200
	assert response.json()["items"] == []


def test_remove_item_not_in_cart_returns_404(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session)

	response = client.delete(
		f"/api/v1/cart/items/{part.id}", headers=auth_headers(cliente)
	)

	assert response.status_code == 404


def test_clear_cart(client, db_session):
	cliente = make_client(db_session)
	part_a = make_part(db_session, part_code="A", name="A")
	part_b = make_part(db_session, part_code="B", name="B")
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part_a.id, "amount": 1}, headers=headers
	)
	client.post(
		"/api/v1/cart/items", json={"part_id": part_b.id, "amount": 1}, headers=headers
	)
	response = client.delete("/api/v1/cart", headers=headers)

	assert response.status_code == 200
	body = response.json()
	assert body["items"] == []
	assert body["total"] == 0


# =====================================================
# TOTAL
# =====================================================


def test_cart_total_is_sum_of_subtotals(client, db_session):
	cliente = make_client(db_session)
	part_a = make_part(db_session, part_code="A", name="A", price=1000, stock=5)
	part_b = make_part(db_session, part_code="B", name="B", price=2500, stock=5)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part_a.id, "amount": 2}, headers=headers
	)
	client.post(
		"/api/v1/cart/items", json={"part_id": part_b.id, "amount": 1}, headers=headers
	)
	response = client.get("/api/v1/cart", headers=headers)

	assert response.json()["total"] == 4500


def test_cart_total_reflects_current_part_price_not_a_stored_copy(client, db_session):
	cliente = make_client(db_session)
	part = make_part(db_session, price=1000, stock=5)
	headers = auth_headers(cliente)

	client.post(
		"/api/v1/cart/items", json={"part_id": part.id, "amount": 2}, headers=headers
	)

	part.price = 1500
	db_session.commit()

	response = client.get("/api/v1/cart", headers=headers)
	body = response.json()

	assert body["items"][0]["price"] == 1500
	assert body["total"] == 3000


# =====================================================
# AISLAMIENTO ENTRE CLIENTES
# =====================================================


def test_client_cannot_see_another_clients_cart(client, db_session):
	cliente_a = make_client(db_session, username="ana", email="ana@example.com")
	cliente_b = make_client(db_session, username="beto", email="beto@example.com")
	part = make_part(db_session)

	client.post(
		"/api/v1/cart/items",
		json={"part_id": part.id, "amount": 1},
		headers=auth_headers(cliente_a),
	)

	response = client.get("/api/v1/cart", headers=auth_headers(cliente_b))

	assert response.json()["items"] == []


def test_client_cannot_modify_another_clients_cart(client, db_session):
	cliente_a = make_client(db_session, username="carla", email="carla@example.com")
	cliente_b = make_client(db_session, username="dario", email="dario@example.com")
	part = make_part(db_session)

	client.post(
		"/api/v1/cart/items",
		json={"part_id": part.id, "amount": 2},
		headers=auth_headers(cliente_a),
	)

	# cliente_b no tiene ese item en SU carrito, aunque exista en el de cliente_a
	response = client.patch(
		f"/api/v1/cart/items/{part.id}",
		json={"amount": 1},
		headers=auth_headers(cliente_b),
	)
	assert response.status_code == 404

	response = client.delete(
		f"/api/v1/cart/items/{part.id}", headers=auth_headers(cliente_b)
	)
	assert response.status_code == 404

	# el carrito de cliente_a no cambió
	cart_a = client.get("/api/v1/cart", headers=auth_headers(cliente_a)).json()
	assert cart_a["items"][0]["amount"] == 2
