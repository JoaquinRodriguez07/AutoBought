"""Loads the generated catalog data into the database.

Usage: python -m scripts.seed

Reads data/car_models.json and data/parts.json and inserts them. Run
scripts/generate_dataset.py first if those files don't exist yet.

La base tiene que estar preparada con las migraciones (`alembic upgrade
head`): el seed carga datos, no crea ni cambia tablas, y si la base no está
al día no corre.

Se puede correr las veces que haga falta, también dos a la vez: agrega
lo que falta (modelos de auto, repuestos y compatibilidades nuevas, por
ejemplo de una marca agregada) y actualiza los repuestos que ya existen
(por su código) con lo que cambió en parts.json (nombre, descripción,
especificaciones y garantía), sin tocar precios, stock, pedidos, carritos
ni favoritos. También elimina compatibilidades obsoletas de los códigos
que están en parts.json, sin borrar productos ni datos transaccionales.
"""

import json
from pathlib import Path

from sqlalchemy import delete, insert, text, tuple_
from sqlalchemy.dialects import postgresql, sqlite

from app.db.migrations import require_head
from app.db.session import SessionLocal, engine
from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part
import app.models

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def load_json(filename, key):
    path = DATA_DIR / filename
    return json.loads(path.read_text(encoding="utf-8"))[key]


# Dos seeds a la vez (dos personas contra la base de la nube, por ejemplo)
# se esperan: el segundo arranca cuando el primero confirmó. Cualquier número
# fijo sirve; solo tiene que ser el mismo en todos.
SEED_LOCK = 168_2026


def lock_seed(db):
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SEED_LOCK})


def insert_ignoring(db, model, *conflict_columns):
    """INSERT ... ON CONFLICT (columnas) DO NOTHING, en Postgres o en SQLite
    (los tests): si la fila ya está, no la duplica ni falla."""
    dialect = postgresql if db.get_bind().dialect.name == "postgresql" else sqlite
    return dialect.insert(model).on_conflict_do_nothing(index_elements=list(conflict_columns))


DETAIL_FIELDS = ("name", "description", "specifications", "warranty_months", "warranty_provider")


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
    db.flush()
    return updated


def add_missing_catalog(db, car_models_data, parts_data):
    """Carga lo que la base no tiene: modelos de auto (por marca, modelo y
    motor), repuestos (por código) y compatibilidades. Lo que ya está no se
    toca. Sobre una base vacía, carga el catálogo entero.

    Todo va en tandas: los modelos, los repuestos y las compatibilidades
    nuevos se mandan en INSERT de muchas filas (SQLAlchemy los agrupa y
    devuelve los ids). Contra una base remota, insertar de a uno son miles
    de viajes de ida y vuelta y el seed tarda muchísimo.

    Los repuestos y las compatibilidades van con ON CONFLICT DO NOTHING: si
    otro proceso cargó el mismo código entre la consulta y el INSERT, la
    restricción UNIQUE de part_code (y la clave de compatibility) lo frena
    y la fila no se duplica. Los modelos de auto no tienen una restricción
    así; a esos los protege lock_seed.

    No confirma: lo hace seed_catalog, todo junto.

    Devuelve cuántos modelos y cuántos repuestos agregó."""
    lock_seed(db)
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
    added_parts = 0
    if new_parts:
        returned = db.execute(
            insert_ignoring(db, Part, "part_code").returning(Part.id, Part.part_code),
            list(new_parts.values()),
        ).all()
        added_parts = len(returned)
        # Los que se saltearon por conflicto no vuelven en el RETURNING.
        part_ids = dict(db.query(Part.part_code, Part.id))

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
        db.execute(insert_ignoring(db, Compatibility, "part_id", "car_model_id"), rows)

    db.flush()
    return len(new_models), added_parts



def remove_obsolete_compatibilities(db, car_models_data, parts_data):
    """Sincroniza las asociaciones de los repuestos administrados por parts.json.

    Solo borra filas de compatibility; nunca Part, OrderItem, Cart ni Favorite.
    Usa la misma transacción y bloqueo que la inserción previa.
    """
    codes = {p["part_code"] for p in parts_data}
    ids = dict(db.query(Part.part_code, Part.id).filter(Part.part_code.in_(codes))) if codes else {}
    models = {
        (m.brand, m.model, m.engine_code): m.id for m in db.query(CarModel)
    }
    wanted = {
        (ids[p["part_code"]], models[(c["brand"], c["model"], c["engine_code"])])
        for p in parts_data for c in p["compatibilities"]
    }
    managed_ids = set(ids.values())
    stale = [
        (part_id, model_id)
        for part_id, model_id in db.query(Compatibility.part_id, Compatibility.car_model_id)
        if part_id in managed_ids and (part_id, model_id) not in wanted
    ]
    # 2 parámetros por fila; lotes cortos para cumplir el límite de SQLite.
    for start in range(0, len(stale), 400):
        db.execute(delete(Compatibility).where(
            tuple_(Compatibility.part_id, Compatibility.car_model_id).in_(stale[start:start + 400])
        ))
    db.flush()
    return len(stale)


def seed_catalog(db, car_models_data, parts_data):
    """Agrega, actualiza detalles y elimina asociaciones obsoletas atómicamente."""
    try:
        added = add_missing_catalog(db, car_models_data, parts_data)
        updated = update_details(db, parts_data)
        remove_obsolete_compatibilities(db, car_models_data, parts_data)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return (*added, updated)


def main():
    require_head(engine)
    db = SessionLocal()

    car_models_data = load_json("car_models.json", "car_models")
    parts_data = load_json("parts.json", "parts")
    new_models, new_parts, updated = seed_catalog(db, car_models_data, parts_data)
    print(
        f"Added {new_models} car models and {new_parts} parts; "
        f"updated the details of {updated} parts."
    )
    db.close()


if __name__ == "__main__":
    main()
