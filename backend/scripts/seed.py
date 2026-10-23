"""Loads the generated catalog data into the database.

Usage: python -m scripts.seed

Reads data/car_models.json and data/parts.json and inserts them. Run
scripts/generate_dataset.py first if those files don't exist yet.
"""

import json
from pathlib import Path

from sqlalchemy import text

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part
import app.models

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def load_json(filename, key):
    path = DATA_DIR / filename
    return json.loads(path.read_text(encoding="utf-8"))[key]


def agregar_columnas_nuevas():
    """Parche hasta que haya migraciones: create_all no agrega columnas a
    tablas que ya existen. Se puede correr muchas veces. Sintaxis de Postgres."""
    with engine.begin() as conn:
        conn.execute(
            text(
                'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS '
                "session_version INTEGER NOT NULL DEFAULT 0"
            )
        )


def main():
    Base.metadata.create_all(bind=engine)
    agregar_columnas_nuevas()
    db = SessionLocal()

    if db.query(CarModel).count() > 0:
        print("Data already loaded, skipping.")
        db.close()
        return

    car_models_data = load_json("car_models.json", "car_models")
    index = {}
    for data in car_models_data:
        car_model = CarModel(
            brand=data["brand"],
            model=data["model"],
            engine_code=data["engine_code"],
        )
        db.add(car_model)
        db.flush()
        key = (data["brand"], data["model"], data["engine_code"])
        index[key] = car_model.id

    parts_data = load_json("parts.json", "parts")
    for data in parts_data:
        part = Part(
            part_code=data["part_code"],
            name=data["name"],
            manufacturer=data["manufacturer"],
            category=data["category"],
            color=data["color"],
            price=data["price"],
            stock=data["stock"],
        )
        db.add(part)
        db.flush()

        for compat in data["compatibilities"]:
            key = (compat["brand"], compat["model"], compat["engine_code"])
            db.add(
                Compatibility(
                    part_id=part.id,
                    car_model_id=index[key],
                    year_from=compat["year_from"],
                    year_to=compat["year_to"],
                )
            )

    db.commit()
    print(f"Loaded {len(car_models_data)} car models and {len(parts_data)} parts.")
    db.close()


if __name__ == "__main__":
    main()