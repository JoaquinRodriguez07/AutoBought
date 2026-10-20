from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models.client import Client
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part


def make_client(db_session, username, email):
    client = Client(
        username=username,
        password="test-password",
        name=username.title(),
        email=email,
    )
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


def auth_headers(client):
    token = create_access_token(
        subject=str(client.user_id),
        extra_claims={"user_type": "client"},
    )
    return {"Authorization": f"Bearer {token}"}


def make_part(db_session, part_code, name, price):
    part = Part(
        part_code=part_code,
        name=name,
        category="Test",
        price=price,
        stock=10,
    )
    db_session.add(part)
    db_session.commit()
    db_session.refresh(part)
    return part


def make_order(db_session, client, created_at, items, status=OrderStatus.CONFIRMED):
    """Create a past order from (part, quantity, frozen unit price) tuples."""
    order = Order(
        client_id=client.user_id,
        created_at=created_at,
        status=status,
        ship_personal_name=client.name,
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Visa •••• 1234",
        items=[
            OrderItem(part=part, quantity=quantity, frozen_price=unit_price)
            for part, quantity, unit_price in items
        ],
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def test_history_in_order(client, db_session):
    """Scenario: See purchases in order
    Given that I started my session and made 3 purchases on different dates
    When I open "Historial de compras"
    Then I see the three purchases from the most recent to the least recent
    And each one displays its date, id and total price
    """
    customer = make_client(db_session, "gary", "gary@example.com")
    part = make_part(db_session, "BRK-001", "Brake pads", 1000)
    purchases = [
        make_order(
            db_session,
            customer,
            datetime(2026, 1, 3, tzinfo=timezone.utc),
            [(part, 2, 1000)],
        ),
        make_order(
            db_session,
            customer,
            datetime(2026, 1, 1, tzinfo=timezone.utc),
            [(part, 1, 1000)],
        ),
        make_order(
            db_session,
            customer,
            datetime(2026, 1, 2, tzinfo=timezone.utc),
            [(part, 3, 1200)],
        ),
    ]
    expected = sorted(purchases, key=lambda purchase: purchase.created_at, reverse=True)

    response = client.get("/api/v1/orders", headers=auth_headers(customer))

    assert response.status_code == 200
    orders = response.json()["orders"]
    assert [order["order_id"] for order in orders] == [
        purchase.order_id for purchase in expected
    ]
    assert [order["total"] for order in orders] == [2000, 3600, 1000]
    assert [
        datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
        for order in orders
    ] == [purchase.created_at for purchase in expected]


def test_history_full_details(client, db_session):
    """Scenario: See full details of a purchase
    Given I have made a purchase
    And I check my history
    When I select a purchase order
    Then I see the parts with their quantities and unitary prices
    """
    customer = make_client(db_session, "ana", "ana@example.com")
    pads = make_part(db_session, "BRK-001", "Brake pads", 1000)
    filter_part = make_part(db_session, "FLT-001", "Air filter", 2500)
    purchase = make_order(
        db_session,
        customer,
        datetime(2026, 2, 5, tzinfo=timezone.utc),
        [(pads, 2, 900), (filter_part, 1, 2500)],
    )

    response = client.get(
        f"/api/v1/orders/{purchase.order_id}",
        headers=auth_headers(customer),
    )

    assert response.status_code == 200
    order = response.json()
    assert order["order_id"] == purchase.order_id
    assert order["total"] == 4300
    assert {
        item["name"]: (item["quantity"], item["frozen_price"])
        for item in order["items"]
    } == {
        "Brake pads": (2, 900),
        "Air filter": (1, 2500),
    }


def test_history_only_returns_the_authenticated_users_purchases(client, db_session):
    """Scenario: Just my purchases
    Given I have made purchases
    And other user has made purchases
    When I check my history
    Then I see my own purchases
    But I do not see the other user's purchases
    """
    gary = make_client(db_session, "gary", "gary@example.com")
    other_customer = make_client(db_session, "ana", "ana@example.com")
    part = make_part(db_session, "BRK-001", "Brake pads", 1000)
    gary_purchase = make_order(
        db_session,
        gary,
        datetime(2026, 3, 1, tzinfo=timezone.utc),
        [(part, 1, 1000)],
    )
    other_purchase = make_order(
        db_session,
        other_customer,
        datetime(2026, 3, 2, tzinfo=timezone.utc),
        [(part, 2, 1000)],
    )

    response = client.get("/api/v1/orders", headers=auth_headers(gary))

    assert response.status_code == 200
    returned_ids = {order["order_id"] for order in response.json()["orders"]}
    assert returned_ids == {gary_purchase.order_id}
    assert other_purchase.order_id not in returned_ids


def test_order_detail_returns_404_for_another_clients_order(client, db_session):
    """An order belonging to another client is indistinguishable from a missing order."""
    customer = make_client(db_session, "gary", "gary@example.com")
    other_customer = make_client(db_session, "ana", "ana@example.com")
    part = make_part(db_session, "BRK-001", "Brake pads", 1000)
    other_purchase = make_order(
        db_session,
        other_customer,
        datetime(2026, 3, 2, tzinfo=timezone.utc),
        [(part, 2, 1000)],
    )

    response = client.get(
        f"/api/v1/orders/{other_purchase.order_id}",
        headers=auth_headers(customer),
    )

    assert response.status_code == 404


def test_history_for_customer_without_purchases_is_empty(client, db_session):
    """Scenario: Purchaseless? :(
    Given I never made a purchase
    When I open "Historial de compras"
    Then I see a message letting me know I have not made any purchases yet
    """
    customer = make_client(db_session, "luis", "luis@example.com")

    response = client.get("/api/v1/orders", headers=auth_headers(customer))

    assert response.status_code == 200
    assert response.json()["orders"] == []

def test_history_shows_the_status_of_each_order(client, db_session):
    """Scenario: Status in the history
    When I check my purchase history
    Then I see the status of each order
    """
    customer = make_client(db_session, "ana", "ana@example.com")
    pads = make_part(db_session, "BRK-001", "Brake pads", 1000)
    make_order(
        db_session, customer, datetime(2026, 1, 1, tzinfo=timezone.utc),
        [(pads, 1, 1000)], status=OrderStatus.DELIVERED,
    )
    make_order(
        db_session, customer, datetime(2026, 2, 1, tzinfo=timezone.utc),
        [(pads, 1, 1000)],
    )

    response = client.get("/api/v1/orders", headers=auth_headers(customer))

    assert response.status_code == 200
    assert [order["status"] for order in response.json()["orders"]] == [
        "confirmed",
        "delivered",
    ]
