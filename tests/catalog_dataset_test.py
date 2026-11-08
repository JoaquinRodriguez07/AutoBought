"""Tests de los datos del catálogo generados por scripts/generate_dataset.py."""

import copy
import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part
from scripts import seed
from scripts.generate_dataset import (
    NEW_BRAND_MODELS,
    NEW_ENGINE_PARTS,
    NEW_PLATFORM_PARTS,
    NEW_UNIVERSAL_PARTS,
    PLATFORMS,
    REAR_DISC_PARTS,
    REAR_DRUM_PARTS,
    build_car_models,
    build_parts,
    check_parts,
)

PARTS_JSON = Path(__file__).resolve().parents[1] / "backend" / "data" / "parts.json"


@pytest.fixture(scope="module")
def catalog():
    car_models = build_car_models()
    return car_models, build_parts(car_models)


# ---------------------------------------------------------------- datos del script

def test_parts_json_is_to_the_day_with_the_script(catalog):
    # Si falla: se cambió generate_dataset.py y falta correrlo
    # (uv run python -m scripts.generate_dataset).
    _, parts = catalog
    assert json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"] == parts


TIPOS_NUEVOS = tuple(
    name for name, *_ in NEW_ENGINE_PARTS + NEW_PLATFORM_PARTS + REAR_DISC_PARTS
    + REAR_DRUM_PARTS + NEW_UNIVERSAL_PARTS
)


def _originales(car_models):
    nuevas = {(brand, model) for brand, model, *_ in NEW_BRAND_MODELS}
    return [m for m in car_models if (m["brand"], m["model"]) not in nuevas]


def _catalogo_original(car_models):
    """El catálogo de antes de las marcas y los tipos de repuesto nuevos."""
    return [p for p in build_parts(_originales(car_models)) if not p["name"].startswith(TIPOS_NUEVOS)]


def test_adding_brands_and_types_no_changes_the_parts_that_already_existed(catalog):
    # Las bases cargadas buscan los repuestos por código: los de antes tienen
    # que quedar iguales (solo suman compatibilidades).
    car_models, parts = catalog
    antes = _catalogo_original(car_models)
    without_compat = lambda part: {k: v for k, v in part.items() if k != "compatibilities"}

    assert [without_compat(p) for p in parts[:len(antes)]] == [without_compat(p) for p in antes]


def test_each_modelo_has_a_single_platform_and_its_brakes_rear(catalog):
    car_models, parts = catalog
    car_models_list = [model for _, models in PLATFORMS.values() for model in models]
    assert len(car_models_list) == len(set(car_models_list))
    assert set(car_models_list) == {(m["brand"], m["model"]) for m in car_models}

    # Atrás, discos con sus pastillas o campanas: nunca las dos cosas.
    for brand, model in car_models_list:
        traseros = {
            p["name"].split(" de freno")[0]
            for p in parts
            if "traser" in p["name"] and p["category"] == "Frenos"
            and any((c["brand"], c["model"]) == (brand, model) for c in p["compatibilities"])
        }
        assert traseros in ({"Pastillas", "Discos"}, {"Campanas"}), (brand, model, traseros)


def test_each_brand_new_has_its_parts(catalog):
    _, parts = catalog
    by_brand = {}
    for part in parts:
        for compat in part["compatibilities"]:
            by_brand.setdefault(compat["brand"], set()).add(part["name"].split(" ")[0])
    for brand, *_ in NEW_BRAND_MODELS:
        # Los de motor, los de modelo, los universales y la batería.
        assert {"Filtro", "Bujía", "Pastillas", "Aceite", "Batería"} <= by_brand[brand], brand


def test_each_part_has_description_specifications_and_warranty(catalog):
    _, parts = catalog
    for part in parts:
        assert part["manufacturer"] in part["description"], part["part_code"]
        assert part["specifications"], part["part_code"]
        for pair in part["specifications"]:
            assert len(pair) == 2 and all(isinstance(v, str) and v for v in pair), part["part_code"]
        assert part["warranty_months"] > 0
        assert part["warranty_provider"] in ("fabricante", "vendedor")


def test_the_brands_budget_have_warranty_of_the_seller(catalog):
    _, parts = catalog
    provider = {p["manufacturer"]: p["warranty_provider"] for p in parts}
    assert provider["Fram"] == "vendedor"
    assert provider["Bosch"] == "fabricante"


def test_no_manufacturer_is_a_brand_of_car(catalog):
    car_models, parts = catalog
    car_brands = {m["brand"] for m in car_models}
    assert not {p["manufacturer"] for p in parts} & car_brands


def test_nor_the_name_nor_the_description_name_cars(catalog):
    # Para qué autos es un repuesto lo dicen sus compatibilidades.
    car_models, parts = catalog
    cars = {m["brand"] for m in car_models} | {m["model"] for m in car_models}
    for part in parts:
        for field in ("name", "description"):
            palabras = set(part[field].replace(".", " ").replace(",", " ").split())
            assert not palabras & cars, (part["part_code"], field)


def test_check_parts_rejects_a_manufacturer_that_is_brand_of_car(catalog):
    car_models, parts = catalog
    mal = copy.deepcopy(parts[0])
    mal["manufacturer"] = "Chevrolet"
    mal["name"] = "Filtro de aceite Chevrolet 1.4 8V"

    with pytest.raises(ValueError, match="marca de auto"):
        check_parts([mal], car_models)


@pytest.mark.parametrize("field", ["name", "description"])
def test_check_parts_rejects_a_car_in_the_name_or_the_description(catalog, field):
    car_models, parts = catalog
    mal = copy.deepcopy(parts[0])
    mal[field] = f"{mal[field]} Chevrolet Onix"

    with pytest.raises(ValueError, match="nombra un auto"):
        check_parts([mal], car_models)


# ---------------------------------------------------------------- seed sobre una base existente

@pytest.fixture
def loaded_db():
    """Base con el esquema de hoy y un repuesto cargado antes de que el
    catálogo tuviera descripción, especificaciones y garantía."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO part (part_code, name, manufacturer, category, price, stock) "
            "VALUES ('FIL-0001', 'Nombre viejo', 'Mann-Filter', 'Filtros', 123, 7)"
        ))
    return engine


def test_seed_updates_the_details_without_touching_price_nor_stock(loaded_db, catalog):
    _, parts = catalog
    db = sessionmaker(bind=loaded_db)()

    assert seed.update_details(db, parts) == 1

    part = db.query(Part).filter_by(part_code="FIL-0001").one()
    new_item = next(p for p in parts if p["part_code"] == "FIL-0001")
    assert part.name == new_item["name"]
    assert part.description == new_item["description"]
    assert part.specifications == new_item["specifications"]
    assert (part.warranty_months, part.warranty_provider) == (new_item["warranty_months"], new_item["warranty_provider"])
    assert (part.price, part.stock) == (123, 7)
    # Sin cambios, no actualiza nada.
    assert seed.update_details(db, parts) == 0


def test_seed_adds_the_brands_new_a_db_loaded_without_touching_it_that_was(catalog):
    car_models, parts = catalog
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()

    # Una base cargada antes de las marcas nuevas, con un precio y un stock
    # que cambiaron desde entonces.
    originales = _originales(car_models)
    antes = _catalogo_original(car_models)
    assert seed.add_missing_catalog(db, originales, antes) == (len(originales), len(antes))
    filter_part = db.query(Part).filter_by(part_code="FIL-0001").one()
    filter_part.price, filter_part.stock = 123, 7
    db.commit()

    new_items = seed.add_missing_catalog(db, car_models, parts)

    assert new_items == (len(car_models) - len(originales), len(parts) - len(antes))
    assert db.query(CarModel).count() == len(car_models)
    assert db.query(Part).count() == len(parts)
    assert db.query(Compatibility).count() == sum(len(p["compatibilities"]) for p in parts)
    assert (filter_part.price, filter_part.stock) == (123, 7)
    # Un repuesto que ya estaba (el aceite) ahora también le sirve a un auto nuevo.
    swift = db.query(CarModel).filter_by(brand="Suzuki", model="Swift").one()
    aceite = next(p for p in parts if p["name"].startswith("Aceite de motor"))
    aceite_id = db.query(Part.id).filter_by(part_code=aceite["part_code"]).scalar()
    assert db.get(Compatibility, (aceite_id, swift.id)) is not None
    # La segunda vez no agrega nada.
    assert seed.add_missing_catalog(db, car_models, parts) == (0, 0)
