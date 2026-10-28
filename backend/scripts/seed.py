"""Loads the generated catalog data into the database.

Usage: python -m scripts.seed

Reads data/car_models.json and data/parts.json and inserts them. Run
scripts/generate_dataset.py first if those files don't exist yet.

Si la base ya tiene el catálogo, no lo vuelve a cargar: actualiza los
repuestos que ya existen (por su código) con lo que cambió en parts.json
(nombre, descripción, especificaciones y garantía), sin tocar precios,
stock, pedidos, carritos ni favoritos. Las columnas que se agregaron
después de creada la base (descripción, especificaciones, garantía y la
versión de sesión del usuario) se agregan solas: no hace falta borrar la base.
"""

import json
from pathlib import Path

from sqlalchemy import inspect, text

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


# Columnas de `part` que no estaban cuando se crearon las primeras bases.
# create_all no agrega columnas a una tabla que ya existe.
NEW_PART_COLUMNS = {
    "description": "TEXT",
    "specifications": "JSON",  # JSONB en Postgres (ver models/part.py)
    "warranty_months": "INTEGER",
    "warranty_provider": "VARCHAR(20)",
}

# Columnas de `user` que no estaban cuando se crearon las primeras bases.
NEW_USER_COLUMNS = {
    # Versión de sesión: sube al cambiar la contraseña e invalida los tokens anteriores.
    "session_version": "INTEGER NOT NULL DEFAULT 0",
}

DETAIL_FIELDS = ("name", "description", "specifications", "warranty_months", "warranty_provider")


def add_missing_columns():
    postgres = engine.dialect.name == "postgresql"
    inspector = inspect(engine)
    existing = {column["name"]: column["type"] for column in inspector.get_columns("part")}
    user_columns = (
        {column["name"] for column in inspector.get_columns("user")}
        if inspector.has_table("user")
        else None
    )
    with engine.begin() as connection:
        if user_columns is not None:
            for name, sql_type in NEW_USER_COLUMNS.items():
                if name not in user_columns:
                    connection.execute(text(f'ALTER TABLE "user" ADD COLUMN {name} {sql_type}'))
                    print(f"Added column user.{name}.")
        for name, sql_type in NEW_PART_COLUMNS.items():
            if postgres and sql_type == "JSON":
                sql_type = "JSONB"
            if name not in existing:
                connection.execute(text(f"ALTER TABLE part ADD COLUMN {name} {sql_type}"))
                print(f"Added column part.{name}.")
            elif postgres and sql_type == "JSONB" and type(existing[name]).__name__ == "JSON":
                # Una columna creada como JSON común (sin comparación) pasa a JSONB.
                connection.execute(text(
                    f"ALTER TABLE part ALTER COLUMN {name} TYPE JSONB USING {name}::jsonb"
                ))
                print(f"Changed column part.{name} to JSONB.")


def update_details(db, parts_data):
    by_code = {part.part_code: part for part in db.query(Part)}
    updated = 0
    for data in parts_data:
        part = by_code.get(data["part_code"])
        if part is None:
            continue
        changed = False
        for field in DETAIL_FIELDS:
            if getattr(part, field) != data[field]:
                setattr(part, field, data[field])
                changed = True
        updated += changed
    db.commit()
    return updated


def main():
    Base.metadata.create_all(bind=engine)
    add_missing_columns()
    db = SessionLocal()

    if db.query(CarModel).count() > 0:
        updated = update_details(db, load_json("parts.json", "parts"))
        print(f"Data already loaded: updated the details of {updated} parts.")
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
            description=data["description"],
            specifications=data["specifications"],
            warranty_months=data["warranty_months"],
            warranty_provider=data["warranty_provider"],
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