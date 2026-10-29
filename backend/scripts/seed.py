"""Loads the generated catalog data into the database.

Usage: python -m scripts.seed

Reads data/car_models.json and data/parts.json and inserts them. Run
scripts/generate_dataset.py first if those files don't exist yet.

Si la base ya tiene el catálogo, no lo vuelve a cargar: agrega solo lo
que falta (modelos de auto, repuestos y compatibilidades nuevas, por
ejemplo de una marca agregada) y actualiza los repuestos que ya existen
(por su código) con lo que cambió en parts.json (nombre, descripción,
especificaciones y garantía), sin tocar precios, stock, pedidos, carritos
ni favoritos. Las columnas que se agregaron después de creada la base
(descripción, especificaciones, garantía y la versión de sesión del
usuario) se agregan solas: no hace falta borrar la base.
"""

import json
from pathlib import Path

from sqlalchemy import insert, inspect, text

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


def add_missing_catalog(db, car_models_data, parts_data):
    """Carga lo que la base no tiene: modelos de auto (por marca, modelo y
    motor), repuestos (por código) y compatibilidades. Lo que ya está no se
    toca. Sobre una base vacía, carga el catálogo entero.

    Todo va en tandas: los modelos, los repuestos y las compatibilidades
    nuevos se mandan en INSERT de muchas filas (SQLAlchemy los agrupa y
    devuelve los ids). Contra una base remota, insertar de a uno son miles
    de viajes de ida y vuelta y el seed tarda muchísimo.

    Devuelve cuántos modelos y cuántos repuestos agregó."""
    index = {
        (car_model.brand, car_model.model, car_model.engine_code): car_model.id
        for car_model in db.query(CarModel)
    }
    new_models = {}
    for data in car_models_data:
        key = (data["brand"], data["model"], data["engine_code"])
        if key not in index:
            new_models[key] = {"brand": key[0], "model": key[1], "engine_code": key[2]}
    if new_models:
        returned = db.execute(
            insert(CarModel).returning(
                CarModel.id, CarModel.brand, CarModel.model, CarModel.engine_code
            ),
            list(new_models.values()),
        )
        index.update({(row.brand, row.model, row.engine_code): row.id for row in returned})

    part_ids = dict(db.query(Part.part_code, Part.id))
    new_parts = {}
    for data in parts_data:
        if data["part_code"] in part_ids or data["part_code"] in new_parts:
            continue
        new_parts[data["part_code"]] = dict(
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
    if new_parts:
        returned = db.execute(
            insert(Part).returning(Part.id, Part.part_code), list(new_parts.values())
        )
        part_ids.update({row.part_code: row.id for row in returned})

    # Un repuesto que ya estaba puede servirle a un auto nuevo (el aceite,
    # las baterías...).
    compatibilities = set(db.query(Compatibility.part_id, Compatibility.car_model_id))
    rows = []
    for data in parts_data:
        part_id = part_ids[data["part_code"]]
        for compat in data["compatibilities"]:
            car_model_id = index[(compat["brand"], compat["model"], compat["engine_code"])]
            if (part_id, car_model_id) in compatibilities:
                continue
            rows.append({
                "part_id": part_id,
                "car_model_id": car_model_id,
                "year_from": compat["year_from"],
                "year_to": compat["year_to"],
            })
            compatibilities.add((part_id, car_model_id))
    if rows:
        db.execute(insert(Compatibility), rows)

    db.commit()
    return len(new_models), len(new_parts)


def main():
    Base.metadata.create_all(bind=engine)
    add_missing_columns()
    db = SessionLocal()

    car_models_data = load_json("car_models.json", "car_models")
    parts_data = load_json("parts.json", "parts")
    new_models, new_parts = add_missing_catalog(db, car_models_data, parts_data)
    updated = update_details(db, parts_data)
    print(
        f"Added {new_models} car models and {new_parts} parts; "
        f"updated the details of {updated} parts."
    )
    db.close()


if __name__ == "__main__":
    main()
