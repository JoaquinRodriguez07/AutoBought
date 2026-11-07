"""Tests del script que genera el historial de pedidos de prueba."""

import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.order import Order, OrderStatus
from app.models.part import Part
from scripts.seed_order_history import MONTHS, generate_history

HASTA = date(2026, 10, 19)
PARTS_JSON = Path(__file__).resolve().parents[1] / "backend" / "data" / "parts.json"


def _db_with_catalog():
    """Base SQLite en memoria, nueva, con el catálogo real cargado."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    for p in json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"]:
        db.add(Part(part_code=p["part_code"], name=p["name"], manufacturer=p["manufacturer"],
                    category=p["category"],
                    color=p["color"], price=p["price"], stock=p["stock"]))
    db.commit()
    return db


def _orders(db):
    """Los pedidos, comparables entre dos bases (sin ids)."""
    return [
        (
            o.client.email,
            o.created_at.replace(tzinfo=None),
            o.status,
            o.ship_street,
            o.payment_method_label,
            sorted((i.part.part_code, i.quantity, i.frozen_price) for i in o.items),
        )
        for o in db.scalars(select(Order).order_by(Order.created_at, Order.order_id))
    ]


def _stock_of(db):
    return {p.part_code: p.stock for p in db.scalars(select(Part))}


@pytest.fixture(scope="module")
def generated():
    db = _db_with_catalog()
    stock_before = _stock_of(db)
    resumen = generate_history(db, semilla=2026, until=HASTA)
    yield db, resumen, stock_before
    db.close()


def _units_by_month(db, categoria, name_value=""):
    units = Counter()
    for o in db.scalars(select(Order)):
        for i in o.items:
            if i.part.category == categoria and i.part.name.startswith(name_value):
                units[o.created_at.month] += i.quantity
    return units


# ---------------------------------------------------------------- criterios

def test_the_same_seed_generates_the_same_orders():
    primera, segunda = _db_with_catalog(), _db_with_catalog()

    generate_history(primera, semilla=7, until=HASTA)
    generate_history(segunda, semilla=7, until=HASTA)

    assert _orders(primera) == _orders(segunda)
    assert len(_orders(primera)) > 0


def test_another_seed_generates_others_orders():
    primera, segunda = _db_with_catalog(), _db_with_catalog()

    generate_history(primera, semilla=1, until=HASTA)
    generate_history(segunda, semilla=2, until=HASTA)

    assert _orders(primera) != _orders(segunda)


def test_the_stock_no_changes(generated):
    db, _, stock_before = generated

    assert _stock_of(db) == stock_before


def test_there_is_orders_in_each_one_of_the_last_12_months(generated):
    db, resumen, _ = generated
    dates = [o.created_at.date() for o in db.scalars(select(Order))]

    assert len(dates) == resumen.orders_list
    assert min(dates) >= date(HASTA.year - 1, HASTA.month + 1, 1)
    assert max(dates) <= HASTA
    assert len({(f.year, f.month) for f in dates}) == MONTHS


def test_running_it_two_times_no_duplicates(generated):
    db, resumen, _ = generated

    segunda = generate_history(db, semilla=2026, until=HASTA)

    assert segunda.skipped
    assert db.query(Order).count() == resumen.orders_list


def test_without_catalog_notifies_that_there_is_that_loading_it():
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)

    with pytest.raises(RuntimeError, match="scripts.seed"):
        generate_history(sessionmaker(bind=engine)(), until=HASTA)


# ---------------------------------------------------------------- forma de los datos

def test_the_sales_grow_a_it_long_of_the_year(generated):
    db, _, _ = generated
    by_month = Counter((o.created_at.year, o.created_at.month) for o in db.scalars(select(Order)))
    periods = sorted(by_month)

    # Se comparan meses completos y sin estacionalidad fuerte: noviembre vs. septiembre.
    assert by_month[periods[-2]] > 1.4 * by_month[periods[0]]


def test_seasonality_by_season_of_the_year(generated):
    db, _, _ = generated
    invierno, verano, primavera = (6, 7, 8), (12, 1, 2), (9, 10, 11)

    def total(units, periods):
        return sum(units[m] for m in periods)

    baterias = _units_by_month(db, "Eléctrico")
    ignition = _units_by_month(db, "Encendido")
    cooling = _units_by_month(db, "Refrigeración")
    habitaculo = _units_by_month(db, "Filtros", name_value="Filtro de habitáculo")

    assert total(baterias, invierno) > 2 * total(baterias, verano)
    assert total(ignition, invierno) > 2 * total(ignition, verano)
    assert total(cooling, verano) > 2 * total(cooling, invierno)
    # Menos margen: octubre va incompleto y el invierno cae más tarde en el
    # año, con la tendencia ya más alta.
    assert total(habitaculo, primavera) > 1.5 * total(habitaculo, invierno)


def test_few_parts_star_and_many_slow(generated):
    db, _, _ = generated
    units = Counter()
    for o in db.scalars(select(Order)):
        for i in o.items:
            units[i.part_id] += i.quantity
    sales = sorted(units.values(), reverse=True)
    parts_total = db.query(Part).count()

    top_10_percent = sum(sales[: parts_total // 10])
    assert top_10_percent > 0.4 * sum(sales)
    assert sorted(sales)[len(sales) // 2] < sales[0] / 20


def test_there_is_parts_in_risk_with_stock_low_and_sales_high(generated):
    db, resumen, _ = generated
    since = HASTA - timedelta(days=30)
    last_30_days = Counter()
    for o in db.scalars(select(Order)):
        if o.created_at.date() > since and o.status != OrderStatus.CANCELLED:
            for i in o.items:
                last_30_days[i.part.part_code] += i.quantity
    stock = _stock_of(db)

    assert len(resumen.at_risk) == 8
    # Venden en un mes más de lo que tienen en stock.
    assert all(last_30_days[code] > stock[code] for code in resumen.at_risk)


def test_each_car_of_the_catalog_has_a_battery_of_each_manufacturer():
    parts = json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"]
    car_models_list = json.loads((PARTS_JSON.parent / "car_models.json").read_text(encoding="utf-8"))["car_models"]
    baterias = [p for p in parts if p["name"].startswith("Batería")]
    by_manufacturer = Counter(
        (p["manufacturer"], c["brand"], c["model"], c["engine_code"])
        for p in baterias
        for c in p["compatibilities"]
    )

    assert all(
        by_manufacturer[(manufacturer_name, m["brand"], m["model"], m["engine_code"])] == 1
        for manufacturer_name in {p["manufacturer"] for p in baterias}
        for m in car_models_list
    )


def test_the_manufacturer_primary_covers_all_the_cars_and_the_rest_some():
    parts = json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"]
    car_models_list = json.loads((PARTS_JSON.parent / "car_models.json").read_text(encoding="utf-8"))["car_models"]
    brake_pads = [p for p in parts if p["name"].startswith("Pastillas de freno")]
    cars_of = {
        manufacturer_name: {
            (c["brand"], c["model"], c["engine_code"])
            for p in brake_pads if p["manufacturer"] == manufacturer_name
            for c in p["compatibilities"]
        }
        for manufacturer_name in ("Bosch", "Brembo", "TRW", "Ferodo")
    }
    everyone = {(m["brand"], m["model"], m["engine_code"]) for m in car_models_list}

    assert all(p["manufacturer"] for p in parts)
    assert cars_of["Bosch"] == everyone
    assert all(0 < len(cars_of[f]) < len(everyone) for f in ("Brembo", "TRW", "Ferodo"))
