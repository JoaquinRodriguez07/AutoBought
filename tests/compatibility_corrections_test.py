"""Regresiones de compatibilidades y reconciliación del seed."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part
from scripts.generate_dataset import DIESEL_ENGINES, build_car_models, build_parts
from scripts.seed import seed_catalog
import app.models


def test_ningun_diesel_tiene_encendido_a_chispa():
    models = build_car_models()
    parts = build_parts(models)
    for part in parts:
        if part["name"].startswith(("Bujía ", "Bobina de encendido ")):
            assert not any(c["engine_code"] in DIESEL_ENGINES for c in part["compatibilities"])
    toro = [p for p in parts if p["name"].startswith(("Bujía ", "Bobina de encendido "))
            and any(c["brand"] == "Fiat" and c["model"] == "Toro" for c in p["compatibilities"])]
    assert not toro


def test_aceite_manual_lamparas_y_cilindros():
    models = build_car_models()
    parts = build_parts(models)
    index = {(m["brand"], m["model"], m["engine_code"]): m for m in models}
    aceite = [p for p in parts if p["name"].startswith("Aceite de caja 75W90")]
    assert aceite
    assert all(index[c["brand"], c["model"], c["engine_code"]]["transmission"] == "manual"
               for p in aceite for c in p["compatibilities"])
    assert not any(c["model"] == "Toro" and c["brand"] == "Fiat"
                   for p in aceite for c in p["compatibilities"])
    for lamp_type in ("H4", "H7"):
        for p in parts:
            if p["name"].startswith(f"Lámpara de faro {lamp_type}"):
                assert all(index[c["brand"], c["model"], c["engine_code"]]["headlamp"] == lamp_type
                           for c in p["compatibilities"])
    for p in parts:
        if p["name"].startswith("Bujía ") and p["compatibilities"]:
            n = {m["cylinders"] for m in models if any(
                (c["brand"], c["model"], c["engine_code"]) ==
                (m["brand"], m["model"], m["engine_code"]) for c in p["compatibilities"])}
            assert len(n) == 1
            assert [v for k, v in p["specifications"] if k == "Unidades por motor"] == [str(n.pop())]


def test_seed_borra_asociacion_obsoleta_sin_cambiar_referencias():
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    models = build_car_models()
    parts = build_parts(models)
    seed_catalog(db, models, parts)

    toro = db.query(CarModel).filter_by(brand="Fiat", model="Toro").one()
    spark = next(p for p in parts if p["name"].startswith("Bujía "))
    spark_id = db.query(Part.id).filter_by(part_code=spark["part_code"]).scalar()
    db.add(Compatibility(part_id=spark_id, car_model_id=toro.id,
                         year_from=2016, year_to=2024))
    db.commit()
    assert db.get(Compatibility, (spark_id, toro.id)) is not None

    # En una base real estas tablas tienen referencias al part_id. No borrar
    # el repuesto ni cambiar su id garantiza que esas referencias sobrevivan.
    id_before = db.query(Part.id).filter_by(part_code=spark["part_code"]).scalar()
    assert seed_catalog(db, models, parts) == (0, 0, 0)
    assert db.get(Compatibility, (spark_id, toro.id)) is None
    assert db.query(Part.id).filter_by(part_code=spark["part_code"]).scalar() == id_before
    assert seed_catalog(db, models, parts) == (0, 0, 0)
    db.close()
