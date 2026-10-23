import copy
import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.part import Part
from scripts import seed
from scripts.generate_dataset import build_car_models, build_parts, check_parts

PARTS_JSON = Path(__file__).resolve().parents[1] / "backend" / "data" / "parts.json"


@pytest.fixture(scope="module")
def catalogo():
    car_models = build_car_models()
    return car_models, build_parts(car_models)


# ---------------------------------------------------------------- datos del script

def test_parts_json_esta_al_dia_con_el_script(catalogo):
    # Si falla: se cambió generate_dataset.py y falta correrlo
    # (uv run python -m scripts.generate_dataset).
    _, parts = catalogo
    assert json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"] == parts


def test_cada_repuesto_tiene_descripcion_especificaciones_y_garantia(catalogo):
    _, parts = catalogo
    for part in parts:
        assert part["manufacturer"] in part["description"], part["part_code"]
        assert part["specifications"], part["part_code"]
        for pair in part["specifications"]:
            assert len(pair) == 2 and all(isinstance(v, str) and v for v in pair), part["part_code"]
        assert part["warranty_months"] > 0
        assert part["warranty_provider"] in ("fabricante", "vendedor")


def test_las_marcas_economicas_tienen_garantia_del_vendedor(catalogo):
    _, parts = catalogo
    proveedor = {p["manufacturer"]: p["warranty_provider"] for p in parts}
    assert proveedor["Fram"] == "vendedor"
    assert proveedor["Bosch"] == "fabricante"


def test_ningun_fabricante_es_una_marca_de_auto(catalogo):
    car_models, parts = catalogo
    marcas_de_auto = {m["brand"] for m in car_models}
    assert not {p["manufacturer"] for p in parts} & marcas_de_auto


def test_ni_el_nombre_ni_la_descripcion_nombran_autos(catalogo):
    # Para qué autos es un repuesto lo dicen sus compatibilidades.
    car_models, parts = catalogo
    autos = {m["brand"] for m in car_models} | {m["model"] for m in car_models}
    for part in parts:
        for campo in ("name", "description"):
            palabras = set(part[campo].replace(".", " ").replace(",", " ").split())
            assert not palabras & autos, (part["part_code"], campo)


def test_check_parts_rechaza_un_fabricante_que_es_marca_de_auto(catalogo):
    car_models, parts = catalogo
    mal = copy.deepcopy(parts[0])
    mal["manufacturer"] = "Chevrolet"
    mal["name"] = "Filtro de aceite Chevrolet 1.4 8V"

    with pytest.raises(ValueError, match="marca de auto"):
        check_parts([mal], car_models)


@pytest.mark.parametrize("campo", ["name", "description"])
def test_check_parts_rechaza_un_auto_en_el_nombre_o_la_descripcion(catalogo, campo):
    car_models, parts = catalogo
    mal = copy.deepcopy(parts[0])
    mal[campo] = f"{mal[campo]} Chevrolet Onix"

    with pytest.raises(ValueError, match="nombra un auto"):
        check_parts([mal], car_models)


# ---------------------------------------------------------------- seed sobre una base existente

@pytest.fixture
def base_vieja(monkeypatch):
    """Base con la tabla `part` como estaba antes: sin las columnas nuevas."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE part (id INTEGER PRIMARY KEY, part_code VARCHAR(50) NOT NULL, "
            "name VARCHAR(120) NOT NULL, manufacturer VARCHAR(60) NOT NULL, "
            "category VARCHAR(60) NOT NULL, color VARCHAR(40), price INTEGER NOT NULL, "
            "stock INTEGER NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO part (part_code, name, manufacturer, category, price, stock) "
            "VALUES ('FIL-0001', 'Nombre viejo', 'Mann-Filter', 'Filtros', 123, 7)"
        ))
    monkeypatch.setattr(seed, "engine", engine)
    return engine


def test_seed_agrega_las_columnas_que_faltan(base_vieja):
    seed.add_missing_columns()
    seed.add_missing_columns()  # la segunda vez no hace nada

    columnas = {c["name"] for c in inspect(base_vieja).get_columns("part")}
    assert set(seed.NEW_PART_COLUMNS) <= columnas


def test_seed_actualiza_los_detalles_sin_tocar_precio_ni_stock(base_vieja, catalogo):
    _, parts = catalogo
    seed.add_missing_columns()
    Base.metadata.create_all(bind=base_vieja)
    db = sessionmaker(bind=base_vieja)()

    assert seed.update_details(db, parts) == 1

    part = db.query(Part).filter_by(part_code="FIL-0001").one()
    nuevo = next(p for p in parts if p["part_code"] == "FIL-0001")
    assert part.name == nuevo["name"]
    assert part.description == nuevo["description"]
    assert part.specifications == nuevo["specifications"]
    assert (part.warranty_months, part.warranty_provider) == (nuevo["warranty_months"], nuevo["warranty_provider"])
    assert (part.price, part.stock) == (123, 7)
    # Sin cambios, no actualiza nada.
    assert seed.update_details(db, parts) == 0
