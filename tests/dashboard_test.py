"""Endpoints del dashboard del vendedor: evolución de ventas, proyección,
riesgo de agotamiento, detalle de un repuesto y filtros (HU 5.4 a 5.9).

El día se fija con la dependencia today. Las ventas van a mediodía
UTC de mediados de mes, lejos del cambio de mes en cualquier zona horaria.
"""

from datetime import date, datetime, timedelta, timezone

import jwt
import pytest

from backend.main import app
from app.api.v1.endpoints.analytics import today
from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.car_model import CarModel
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part

STOCK = "/api/v1/analytics/stock"
MAS_VENDIDOS = "/api/v1/analytics/best-sellers"
EVOLUCION = "/api/v1/analytics/sales-by-month"
PROYECCION = "/api/v1/analytics/demand-forecast"
RIESGO = "/api/v1/analytics/stockout-risk"
DETALLE = "/api/v1/analytics/parts"
VEHICULOS = "/api/v1/analytics/car-models"


def _headers(user_id, user_type):
    payload = {
        "sub": str(user_id),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return {"Authorization": f"Bearer {jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)}"}


@pytest.fixture
def seller(db_session):
    employee = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    return _headers(employee.user_id, "employee")


@pytest.fixture
def customer(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


def _today(day_number):
    app.dependency_overrides[today] = lambda: day_number


def _part(db_session, code, stock, categoria="Frenos"):
    part = Part(
        part_code=code,
        name=f"Repuesto {code}",
        manufacturer="Bosch",
        category=categoria,
        price=1000,
        stock=stock,
    )
    db_session.add(part)
    db_session.commit()
    return part


def _sale(db_session, customer, part, qty, anio, period, state=OrderStatus.DELIVERED):
    db_session.add(
        Order(
            client_id=customer.user_id,
            created_at=datetime(anio, period, 15, 12, tzinfo=timezone.utc),
            status=state,
            ship_personal_name=customer.name,
            ship_street="Av. Italia",
            ship_number="1234",
            ship_city="Montevideo",
            ship_department="Montevideo",
            payment_method_label="Visa •••• 1234",
            items=[OrderItem(part=part, quantity=qty, frozen_price=part.price)],
        )
    )
    db_session.commit()


def _monthly_sales(db_session, customer, part, units, until=(2026, 3)):
    # Una venta por mes; el último elemento de `unidades` es el mes `hasta`.
    anio, period = until
    for qty in reversed(units):
        if qty:
            _sale(db_session, customer, part, qty, anio, period)
        anio, period = (anio, period - 1) if period > 1 else (anio - 1, 12)


@pytest.mark.parametrize("ruta", [EVOLUCION, PROYECCION, RIESGO, f"{DETALLE}/1", VEHICULOS])
def test_the_endpoints_of_the_dashboard_are_only_for_sellers(client, customer, ruta):
    assert client.get(ruta).status_code == 401
    assert client.get(ruta, headers=_headers(customer.user_id, "client")).status_code == 403


# --- Evolución de ventas (HU 5.4) ---


def test_trend_groups_units_and_revenue_of_the_last_12_months(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    brake_pads = _part(db_session, "FRE-001", stock=10)
    _sale(db_session, customer, brake_pads, 2, 2026, 1)
    _sale(db_session, customer, brake_pads, 3, 2026, 1)
    _sale(db_session, customer, brake_pads, 4, 2026, 3)
    _sale(db_session, customer, brake_pads, 50, 2026, 2, state=OrderStatus.CANCELLED)
    _sale(db_session, customer, brake_pads, 99, 2025, 3)  # hace 13 meses: afuera

    periods = client.get(EVOLUCION, headers=seller).json()["months"]

    assert [m["month"] for m in periods] == [f"2025-{m:02d}" for m in range(4, 13)] + ["2026-01", "2026-02", "2026-03"]
    assert [(m["units"], m["revenue"]) for m in periods[-3:]] == [(5, 5000), (0, 0), (4, 4000)]
    assert all(m["units"] == 0 for m in periods[:-3])
    assert [m["in_progress"] for m in periods] == [False] * 11 + [True]


def test_trend_allows_see_the_increase_between_two_months(client, db_session, seller, customer):
    # Escenario de la HU 5.4: un mes vendió más que el anterior.
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=10)
    _sale(db_session, customer, part, 10, 2026, 2)
    _sale(db_session, customer, part, 25, 2026, 3)

    periods = client.get(EVOLUCION, params={"months": 2}, headers=seller).json()["months"]

    assert [(m["month"], m["units"]) for m in periods] == [("2026-02", 10), ("2026-03", 25)]


def test_trend_filters_by_category_and_by_part(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    brake_pads = _part(db_session, "FRE-001", stock=10, categoria="Frenos")
    discos = _part(db_session, "FRE-002", stock=10, categoria="Frenos")
    filter_part = _part(db_session, "FIL-001", stock=10, categoria="Filtros")
    _sale(db_session, customer, brake_pads, 2, 2026, 3)
    _sale(db_session, customer, discos, 3, 2026, 3)
    _sale(db_session, customer, filter_part, 7, 2026, 3)

    def units(**params):
        return client.get(EVOLUCION, params=params, headers=seller).json()["months"][-1]["units"]

    assert units() == 12
    assert units(category="frenos") == 5
    assert units(search="fil-0") == 7
    assert units(part_id=discos.id) == 3
    assert units(category="Filtros", search="FRE") == 0


def test_trend_includes_the_forecast_of_the_month_next(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=10)
    _monthly_sales(db_session, customer, part, [10] * 12)

    body = client.get(EVOLUCION, params={"months": 3}, headers=seller).json()

    # Se muestran 3 meses, pero la recta se ajusta sobre 12.
    assert len(body["months"]) == 3
    assert body["projection"] == {"month": "2026-04", "units": 10}


def test_trend_rejects_periods_out_of_range(client, seller):
    assert client.get(EVOLUCION, params={"months": 0}, headers=seller).status_code == 422
    assert client.get(EVOLUCION, params={"months": 25}, headers=seller).status_code == 422


# --- Proyección de demanda (HU 5.5) ---


def test_forecast_by_part_of_greater_a_smaller(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    creciente = _part(db_session, "FRE-001", stock=10)
    constante = _part(db_session, "FRE-002", stock=10)
    _part(db_session, "FRE-003", stock=10)  # nunca se vendió
    _monthly_sales(db_session, customer, creciente, [10 * (i + 1) for i in range(12)])
    _monthly_sales(db_session, customer, constante, [5] * 12)

    body = client.get(PROYECCION, headers=seller).json()

    assert body["month"] == "2026-04"
    assert [(p["part_code"], p["projected_units"], p["units_last_12_months"]) for p in body["parts"]] == [
        ("FRE-001", 130, 780),
        ("FRE-002", 5, 60),
        ("FRE-003", 0, 0),
    ]


def test_forecast_account_the_month_in_progress_a_month_complete(client, db_session, seller, customer):
    # El 15 de abril van 15 de 30 días: 5 unidades son 10 a mes completo.
    _today(date(2026, 4, 15))
    part = _part(db_session, "FRE-001", stock=10)
    _monthly_sales(db_session, customer, part, [10] * 11 + [5], until=(2026, 4))

    body = client.get(PROYECCION, headers=seller).json()

    assert body["month"] == "2026-05"
    assert body["parts"][0]["projected_units"] == 10


def test_forecast_never_negative_in_the_endpoint(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=10)
    _monthly_sales(db_session, customer, part, [120, 100, 80, 60, 40, 20, 0, 0, 0, 0, 0, 0])

    assert client.get(PROYECCION, headers=seller).json()["parts"][0]["projected_units"] == 0


def test_forecast_filters_and_limits(client, db_session, seller):
    _today(date(2026, 3, 31))
    _part(db_session, "FRE-001", stock=10, categoria="Frenos")
    _part(db_session, "FRE-002", stock=10, categoria="Frenos")
    _part(db_session, "FIL-001", stock=10, categoria="Filtros")

    frenos = client.get(PROYECCION, params={"category": "Frenos"}, headers=seller).json()["parts"]
    one = client.get(PROYECCION, params={"limit": 1}, headers=seller).json()["parts"]

    assert [p["part_code"] for p in frenos] == ["FRE-001", "FRE-002"]
    assert len(one) == 1


def test_the_calculations_no_change_the_sales_nor_the_stock(client, db_session, seller, customer):
    # Escenario de la HU 5.5: datos reales intactos.
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=10)
    _monthly_sales(db_session, customer, part, [30] * 12)

    def sales():
        return sorted((i.order_id, i.part_id, i.quantity, i.frozen_price) for i in db_session.query(OrderItem))

    antes = sales()
    for ruta in (EVOLUCION, PROYECCION, RIESGO, f"{DETALLE}/{part.id}"):
        assert client.get(ruta, headers=seller).status_code == 200

    db_session.expire_all()
    assert db_session.get(Part, part.id).stock == 10
    assert sales() == antes


# --- Riesgo de agotamiento y alertas (HU 5.6 y 5.7) ---


def test_risk_of_stockout_of_the_more_urgent_to_the_less_urgent(client, db_session, seller, customer):
    # Abril tiene 30 días: 30 unidades proyectadas son 1 por día.
    _today(date(2026, 3, 31))
    high = _part(db_session, "FRE-001", stock=10)  # 10 días
    medium = _part(db_session, "FRE-002", stock=20)  # 20 días
    low = _part(db_session, "FRE-003", stock=100)  # 100 días
    sold_out = _part(db_session, "FRE-004", stock=0)  # 0 días
    _part(db_session, "FRE-005", stock=0)  # sin demanda
    for part in (high, medium, low, sold_out):
        _monthly_sales(db_session, customer, part, [30] * 12)

    body = client.get(RIESGO, headers=seller).json()

    assert body["month"] == "2026-04"
    assert body["thresholds"] == {"high_below": 15, "medium_up_to": 30}
    assert [(p["part_code"], p["coverage_days"], p["risk"]) for p in body["parts"]] == [
        ("FRE-004", 0, "high"),
        ("FRE-001", 10, "high"),
        ("FRE-002", 20, "medium"),
        ("FRE-003", 100, "low"),
        ("FRE-005", None, "low"),
    ]
    assert body["parts"][1]["projected_units"] == 30
    assert body["parts"][1]["daily_demand"] == 1


def test_inside_of_a_level_first_the_that_leaves_more_demand_without_cover(client, db_session, seller, customer):
    # Los dos tienen riesgo alto. El agotado casi no se vende (falta 1
    # unidad); al otro le quedan 10 días pero le faltan 60 para el mes.
    _today(date(2026, 3, 31))
    sold_out_slow = _part(db_session, "FRE-001", stock=0)
    estrella = _part(db_session, "FRE-002", stock=30)
    _monthly_sales(db_session, customer, sold_out_slow, [1] * 12)
    _monthly_sales(db_session, customer, estrella, [90] * 12)

    parts_list = client.get(RIESGO, params={"at_risk_only": True}, headers=seller).json()["parts"]

    assert [(p["part_code"], p["risk"]) for p in parts_list] == [("FRE-002", "high"), ("FRE-001", "high")]


def test_alerts_of_restock_only_risk_high_or_medium(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    high = _part(db_session, "FRE-001", stock=10)
    low = _part(db_session, "FRE-002", stock=100)
    _monthly_sales(db_session, customer, high, [30] * 12)
    _monthly_sales(db_session, customer, low, [30] * 12)

    body = client.get(RIESGO, params={"at_risk_only": True}, headers=seller).json()

    assert [p["part_code"] for p in body["parts"]] == ["FRE-001"]


def test_without_parts_in_risk_the_list_of_alerts_is_empty(client, db_session, seller):
    _today(date(2026, 3, 31))
    _part(db_session, "FRE-001", stock=100)

    assert client.get(RIESGO, params={"at_risk_only": True}, headers=seller).json()["parts"] == []


def test_risk_filters_by_category(client, db_session, seller):
    _today(date(2026, 3, 31))
    _part(db_session, "FRE-001", stock=1, categoria="Frenos")
    _part(db_session, "FIL-001", stock=1, categoria="Filtros")

    body = client.get(RIESGO, params={"category": "Filtros"}, headers=seller).json()

    assert [p["part_code"] for p in body["parts"]] == ["FIL-001"]


# --- Detalle de un repuesto (HU 5.8) ---


def test_detail_of_a_part(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=10)
    _monthly_sales(db_session, customer, part, [30] * 12)
    _sale(db_session, customer, part, 7, 2024, 6)  # vieja: cuenta en el total

    body = client.get(f"{DETALLE}/{part.id}", headers=seller).json()

    assert body["part_code"] == "FRE-001"
    assert body["name"] == "Repuesto FRE-001"
    assert body["stock"] == 10
    assert body["price"] == 1000
    assert body["low_stock"] is False
    assert body["units_sold"] == 367
    assert len(body["months"]) == 12
    assert body["months"][-1] == {"month": "2026-03", "units": 30, "revenue": 30000, "in_progress": True}
    assert body["projection"] == {"month": "2026-04", "units": 30}
    assert body["coverage_days"] == 10
    assert body["risk"] == "high"


def test_detail_of_a_part_that_never_sold(client, db_session, seller):
    _today(date(2026, 3, 31))
    part = _part(db_session, "FRE-001", stock=4)

    body = client.get(f"{DETALLE}/{part.id}", headers=seller).json()

    assert body["units_sold"] == 0
    assert body["stock"] == 4
    assert body["low_stock"] is True
    assert all(m["units"] == 0 for m in body["months"])
    assert body["projection"]["units"] == 0
    assert body["coverage_days"] is None
    assert body["risk"] == "low"


def test_detail_of_a_part_that_no_exists(client, seller):
    response = client.get(f"{DETALLE}/9999", headers=seller)

    assert response.status_code == 404
    assert response.json()["detail"] == "Repuesto no encontrado."


# --- Filtros en stock y más vendidos (HU 5.9) ---


def test_stock_filters_by_category_and_by_part(client, db_session, seller):
    _part(db_session, "FRE-001", stock=1, categoria="Frenos")
    _part(db_session, "FIL-001", stock=2, categoria="Filtros")

    def code_list(**params):
        return [p["part_code"] for p in client.get(STOCK, params=params, headers=seller).json()["parts"]]

    assert code_list() == ["FRE-001", "FIL-001"]
    assert code_list(category="Filtros") == ["FIL-001"]
    assert code_list(search="fre") == ["FRE-001"]
    # Quitar filtros: vacíos es lo mismo que no mandarlos.
    assert code_list(category="", search="") == ["FRE-001", "FIL-001"]


def test_more_sold_by_months_calendar_and_category(client, db_session, seller, customer):
    _today(date(2026, 3, 31))
    brake_pads = _part(db_session, "FRE-001", stock=10, categoria="Frenos")
    filter_part = _part(db_session, "FIL-001", stock=10, categoria="Filtros")
    _sale(db_session, customer, brake_pads, 5, 2026, 3)
    _sale(db_session, customer, brake_pads, 100, 2025, 10)  # hace 6 meses
    _sale(db_session, customer, filter_part, 8, 2026, 2)

    def ranking(**params):
        body = client.get(MAS_VENDIDOS, params=params, headers=seller).json()
        return [(p["part_code"], p["units_sold"]) for p in body["parts"]]

    assert ranking(months=3) == [("FIL-001", 8), ("FRE-001", 5)]
    assert ranking(months=6) == [("FRE-001", 105), ("FIL-001", 8)]
    assert ranking(months=3, category="Frenos") == [("FRE-001", 5)]
    assert ranking(search="FIL") == [("FIL-001", 8)]


# --- Vehículos para el formulario de repuestos (HU 5.10) ---


def test_vehicles_for_the_form(client, db_session, seller):
    db_session.add_all([
        CarModel(brand="Volkswagen", model="Gol", engine_code="1.6"),
        CarModel(brand="Chevrolet", model="Onix", engine_code="1.4 8V"),
    ])
    db_session.commit()

    body = client.get(VEHICULOS, headers=seller).json()

    assert [(m["brand"], m["model"], m["engine_code"]) for m in body["car_models"]] == [
        ("Chevrolet", "Onix", "1.4 8V"),
        ("Volkswagen", "Gol", "1.6"),
    ]
