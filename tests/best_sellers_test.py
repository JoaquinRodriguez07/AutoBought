from datetime import datetime, timedelta, timezone

from app.crud.part import list_best_sellers
from app.models.car_model import CarModel
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part


def make_client(db_session):
    client = Client(
        username="gary",
        password="test-password",
        name="Gary",
        email="gary@example.com",
    )
    db_session.add(client)
    db_session.commit()
    return client


def make_part(db_session, part_code, stock=10):
    part = Part(
        part_code=part_code,
        name=f"Part {part_code}",
        category="Brakes",
        price=1000,
        stock=stock,
    )
    part.compatibilities = [
        Compatibility(
            car_model=CarModel(brand="Toyota", model=part_code, engine_code="2ZR"),
            year_from=2018,
            year_to=2020,
        )
    ]
    db_session.add(part)
    db_session.commit()
    return part


def make_order(db_session, client, items, days_ago=1, status=OrderStatus.CONFIRMED):
    """Create an order from (part, quantity) tuples."""
    order = Order(
        client_id=client.user_id,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        status=status,
        ship_personal_name=client.name,
        ship_street="Av. Italia",
        ship_number="1234",
        ship_city="Montevideo",
        ship_department="Montevideo",
        payment_method_label="Visa •••• 1234",
        items=[
            OrderItem(part=part, quantity=quantity, frozen_price=part.price)
            for part, quantity in items
        ],
    )
    db_session.add(order)
    db_session.commit()
    return order


def codes(best_sellers):
    return [(part.part_code, units) for part, units in best_sellers]


def test_best_sellers_add_up_units_across_orders(db_session):
    client = make_client(db_session)
    pads = make_part(db_session, "BRK-001")
    discs = make_part(db_session, "BRK-002")
    make_part(db_session, "BRK-003")  # never sold
    make_order(db_session, client, [(pads, 2), (discs, 3)])
    make_order(db_session, client, [(pads, 4)])

    assert codes(list_best_sellers(db_session, limit=4)) == [
        ("BRK-001", 6),
        ("BRK-002", 3),
    ]


def test_best_sellers_ignore_cancelled_orders(db_session):
    client = make_client(db_session)
    pads = make_part(db_session, "BRK-001")
    discs = make_part(db_session, "BRK-002")
    make_order(db_session, client, [(pads, 10)], status=OrderStatus.CANCELLED)
    make_order(db_session, client, [(pads, 1), (discs, 2)])

    assert codes(list_best_sellers(db_session, limit=4)) == [
        ("BRK-002", 2),
        ("BRK-001", 1),
    ]


def test_best_sellers_respect_limit_and_break_ties_by_id(db_session):
    client = make_client(db_session)
    parts = [make_part(db_session, f"BRK-00{i}") for i in range(1, 4)]
    make_order(db_session, client, [(part, 1) for part in parts])

    assert codes(list_best_sellers(db_session, limit=2)) == [
        ("BRK-001", 1),
        ("BRK-002", 1),
    ]


def test_best_sellers_only_count_recent_sales_when_days_is_given(db_session):
    client = make_client(db_session)
    pads = make_part(db_session, "BRK-001")
    discs = make_part(db_session, "BRK-002")
    make_order(db_session, client, [(pads, 10)], days_ago=120)
    make_order(db_session, client, [(pads, 1), (discs, 2)], days_ago=10)

    assert codes(list_best_sellers(db_session, limit=4, days=90)) == [
        ("BRK-002", 2),
        ("BRK-001", 1),
    ]
    assert codes(list_best_sellers(db_session, limit=4)) == [
        ("BRK-001", 11),
        ("BRK-002", 2),
    ]


def test_best_sellers_skip_parts_without_stock_when_asked(db_session):
    client = make_client(db_session)
    pads = make_part(db_session, "BRK-001", stock=0)
    discs = make_part(db_session, "BRK-002")
    make_order(db_session, client, [(pads, 5), (discs, 1)])

    assert codes(list_best_sellers(db_session, limit=4, in_stock=True)) == [
        ("BRK-002", 1),
    ]
    assert codes(list_best_sellers(db_session, limit=4)) == [
        ("BRK-001", 5),
        ("BRK-002", 1),
    ]


def test_best_sellers_endpoint_returns_parts_with_units_sold(client, db_session):
    customer = make_client(db_session)
    pads = make_part(db_session, "BRK-001")
    make_order(db_session, customer, [(pads, 3)])

    response = client.get("/api/v1/parts/best-sellers?limit=4&days=90&in_stock=true")

    assert response.status_code == 200
    [part] = response.json()["parts"]
    assert part["part_code"] == "BRK-001"
    assert part["units_sold"] == 3
    assert part["compatible_brands"] == ["Toyota"]
    assert part["stock"] == 10


def test_best_sellers_endpoint_is_empty_without_sales(client, db_session):
    make_part(db_session, "BRK-001")

    response = client.get("/api/v1/parts/best-sellers")

    assert response.status_code == 200
    assert response.json() == {"parts": []}


def test_best_sellers_endpoint_rejects_out_of_range_values(client):
    assert client.get("/api/v1/parts/best-sellers?limit=0").status_code == 422
    assert client.get("/api/v1/parts/best-sellers?limit=21").status_code == 422
    assert client.get("/api/v1/parts/best-sellers?days=0").status_code == 422
