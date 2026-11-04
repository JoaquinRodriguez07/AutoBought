"""Migraciones de Alembic (backend/migrations/) y seed idempotente.

Los tests de SQLite corren siempre. Los de Postgres necesitan un servidor
de prueba en TEST_POSTGRES_URL (por ejemplo
postgresql+psycopg2://postgres:test@localhost:55432/postgres): cada test crea
su propia base con un nombre al azar y la borra al terminar, sin tocar las
demás. Sin la variable, se saltean. Ver README.md.
"""

import json
import os
import threading
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from app.db.base import Base
from app.db.migrations import alembic_config, current_revision, head_revision, include_object, require_head
from app.models.car_model import CarModel
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.favorite import Favorite
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.part import Part
from scripts import db_baseline, seed

DATA_DIR = Path(__file__).resolve().parents[1] / "backend" / "data"
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")


def _load(filename, key):
    return json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))[key]


@pytest.fixture(scope="module")
def catalogo():
    return _load("car_models.json", "car_models"), _load("parts.json", "parts")


def migrate(engine, revision="head"):
    with engine.begin() as connection:
        command.upgrade(alembic_config(connection), revision)


def downgrade(engine, revision):
    with engine.begin() as connection:
        command.downgrade(alembic_config(connection), revision)


def stamp(engine, revision):
    with engine.begin() as connection:
        command.stamp(alembic_config(connection), revision)


def revision_of(engine):
    with engine.connect() as connection:
        return current_revision(connection)


def model_diff(engine):
    """Lo que `alembic revision --autogenerate` propondría: vacío si las
    migraciones dejan la base igual que los modelos."""
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True, "include_object": include_object}
        )
        return compare_metadata(context, Base.metadata)


# Tablas que llegaron con migraciones posteriores a la baseline: las bases
# de antes de Alembic no las tienen.
TABLAS_POSTERIORES = {"order_status_history"}


def legacy_schema(engine):
    """Una base como las de antes de Alembic: create_all con los modelos, sin
    la restricción de part_code (que llega con la migración 0002) ni las
    tablas de las migraciones siguientes."""
    Base.metadata.create_all(
        bind=engine,
        tables=[tabla for nombre, tabla in Base.metadata.tables.items() if nombre not in TABLAS_POSTERIORES],
    )
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE part DROP CONSTRAINT uq_part_part_code"))
        else:
            # SQLite no tiene DROP CONSTRAINT: se recrea la tabla sin ella.
            connection.execute(text("DROP TABLE part"))
            part = Base.metadata.tables["part"]
            unique = next(c for c in part.constraints if c.name == "uq_part_part_code")
            part.constraints.remove(unique)
            try:
                part.create(bind=connection)
            finally:
                part.constraints.add(unique)


def add_data(engine, part_code="FIL-0001"):
    """Un repuesto con un cliente que lo compró, lo tiene en el carrito y en
    favoritos, y un auto compatible."""
    db = sessionmaker(bind=engine)()
    client = Client(username="ana", password="x", name="Ana", email="ana@mail.com")
    part = Part(part_code=part_code, name="Filtro", manufacturer="Mann-Filter",
                category="Filtros", price=500, stock=3)
    car = CarModel(brand="Chevrolet", model="Onix", engine_code="1.4")
    db.add_all([client, part, car])
    db.flush()
    order = Order(
        client_id=client.user_id, ship_personal_name="Ana", ship_street="Av. Italia",
        ship_number="1234", ship_city="Montevideo", ship_department="Montevideo",
        payment_method_label="Mercado Pago",
    )
    db.add_all([
        order,
        Compatibility(part_id=part.id, car_model_id=car.id, year_from=2012, year_to=2020),
        Favorite(client_id=client.user_id, part_id=part.id),
        Cart(client_id=client.user_id),
    ])
    db.flush()
    db.add_all([
        OrderItem(order_id=order.order_id, part_id=part.id, quantity=1, frozen_price=500),
        CartItem(cart_id=client.user_id, part_id=part.id, amount=2),
    ])
    db.commit()
    db.close()


def add_data_part(engine, part_code):
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO part (part_code, name, manufacturer, category, price, stock) "
            "VALUES (:code, 'Otro', 'Bosch', 'Filtros', 100, 1)"
        ), {"code": part_code})


def counts(engine):
    """Filas por tabla, sin las de migraciones posteriores (en una base vieja
    todavía no existen)."""
    with engine.connect() as connection:
        return {
            table: connection.execute(select(func.count()).select_from(Base.metadata.tables[table])).scalar_one()
            for table in Base.metadata.tables
            if table not in TABLAS_POSTERIORES
        }


def assert_relations_intact(engine):
    """Cada fila que apunta a un repuesto, cliente, pedido o auto lo encuentra."""
    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        for child, column, parent, key in (
            ("order_item", "part_id", "part", "id"),
            ("order_item", "order_id", '"order"', "order_id"),
            ("cart_item", "part_id", "part", "id"),
            ("favorite", "part_id", "part", "id"),
            ("compatibility", "part_id", "part", "id"),
            ("compatibility", "car_model_id", "car_model", "id"),
        ):
            orphans = connection.execute(text(
                f"SELECT count(*) FROM {child} c LEFT JOIN {parent} p ON c.{column} = p.{key} "
                f"WHERE p.{key} IS NULL"
            )).scalar_one()
            assert orphans == 0, (child, column)


def part_unique_constraints(engine):
    return {c["name"]: c["column_names"] for c in inspect(engine).get_unique_constraints("part")}


# ---------------------------------------------------------------- SQLite

@pytest.fixture
def sqlite_engine():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    yield engine
    engine.dispose()


def test_base_vacia_queda_con_todas_las_tablas(sqlite_engine):
    migrate(sqlite_engine)

    assert revision_of(sqlite_engine) == head_revision() == "0003"
    tables = set(inspect(sqlite_engine).get_table_names())
    assert tables == set(Base.metadata.tables) | {"alembic_version"}
    assert part_unique_constraints(sqlite_engine) == {"uq_part_part_code": ["part_code"]}


def test_las_migraciones_coinciden_con_los_modelos_en_sqlite(sqlite_engine):
    # Si falla: se cambió un modelo y falta la migración (ver README.md).
    migrate(sqlite_engine)
    assert model_diff(sqlite_engine) == []


def test_downgrade_deshace_cada_migracion(sqlite_engine):
    migrate(sqlite_engine)

    downgrade(sqlite_engine, "0001")
    assert part_unique_constraints(sqlite_engine) == {}
    downgrade(sqlite_engine, "base")
    assert set(inspect(sqlite_engine).get_table_names()) == {"alembic_version"}

    migrate(sqlite_engine)
    assert revision_of(sqlite_engine) == "0003"


def downgrade_0003_con_un_pedido_empaquetando(engine):
    """Con la 0003 aplicada, un pedido en «Empaquetando» con su historial;
    después se deshace la 0003. Devuelve el estado con que queda el pedido."""
    migrate(engine)
    add_data(engine)
    with engine.begin() as connection:
        connection.execute(text("UPDATE \"order\" SET status = 'packing'"))
        connection.execute(text(
            "INSERT INTO order_status_history (order_id, status) "
            "SELECT order_id, 'packing' FROM \"order\""
        ))

    downgrade(engine, "0002")

    assert "order_status_history" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        return connection.execute(text("SELECT status FROM \"order\"")).scalar_one()


def test_deshacer_la_0003_pasa_los_empaquetando_a_confirmado(sqlite_engine):
    assert downgrade_0003_con_un_pedido_empaquetando(sqlite_engine) == "confirmed"
    assert revision_of(sqlite_engine) == "0002"


def test_insertar_un_codigo_nuevo_funciona(sqlite_engine):
    migrate(sqlite_engine)
    add_data(sqlite_engine, "FIL-0001")
    add_data_part(sqlite_engine, "FIL-0002")

    with sqlite_engine.connect() as connection:
        codes = connection.execute(text("SELECT part_code FROM part ORDER BY part_code")).scalars().all()
    assert codes == ["FIL-0001", "FIL-0002"]


def test_insertar_un_codigo_repetido_lo_rechaza_la_base(sqlite_engine):
    migrate(sqlite_engine)
    add_data_part(sqlite_engine, "FIL-0001")

    with pytest.raises(IntegrityError):
        add_data_part(sqlite_engine, "FIL-0001")
    assert counts(sqlite_engine)["part"] == 1


def test_base_existente_se_incorpora_sin_perder_datos(sqlite_engine):
    legacy_schema(sqlite_engine)
    add_data(sqlite_engine)
    antes = counts(sqlite_engine)

    stamp(sqlite_engine, "0001")
    migrate(sqlite_engine)

    assert revision_of(sqlite_engine) == head_revision()
    assert counts(sqlite_engine) == antes
    assert part_unique_constraints(sqlite_engine) == {"uq_part_part_code": ["part_code"]}
    assert_relations_intact(sqlite_engine)


def test_0002_no_se_aplica_si_hay_codigos_repetidos(sqlite_engine):
    migrate(sqlite_engine, "0001")
    add_data_part(sqlite_engine, "FIL-0001")
    add_data_part(sqlite_engine, "FIL-0001")

    with pytest.raises(RuntimeError, match="FIL-0001 \\(2 veces\\)"):
        migrate(sqlite_engine)

    assert revision_of(sqlite_engine) == "0001"
    assert counts(sqlite_engine)["part"] == 2  # no borró nada


def test_el_seed_dos_veces_no_duplica(sqlite_engine, catalogo):
    car_models, parts = catalogo
    migrate(sqlite_engine)
    db = sessionmaker(bind=sqlite_engine)()

    primera = seed.seed_catalog(db, car_models, parts)
    despues_de_la_primera = counts(sqlite_engine)
    segunda = seed.seed_catalog(db, car_models, parts)

    assert primera == (len(car_models), len(parts), 0)
    assert segunda == (0, 0, 0)
    assert counts(sqlite_engine) == despues_de_la_primera
    assert despues_de_la_primera["part"] == len({p["part_code"] for p in parts})
    assert_relations_intact(sqlite_engine)


def test_el_seed_no_toca_lo_que_ya_estaba(sqlite_engine, catalogo):
    car_models, parts = catalogo
    migrate(sqlite_engine)
    db = sessionmaker(bind=sqlite_engine)()
    seed.seed_catalog(db, car_models, parts)
    # Un cliente compró, tiene carrito y favoritos de un repuesto del catálogo.
    add_data(sqlite_engine, "XTRA-0001")
    with sqlite_engine.begin() as connection:
        connection.execute(text("UPDATE part SET price = 1, stock = 99 WHERE part_code = :c"),
                           {"c": parts[0]["part_code"]})
    antes = counts(sqlite_engine)

    seed.seed_catalog(db, car_models, parts)

    assert counts(sqlite_engine) == antes
    primero = db.query(Part).filter_by(part_code=parts[0]["part_code"]).one()
    assert (primero.price, primero.stock) == (1, 99)
    assert_relations_intact(sqlite_engine)


def test_el_seed_no_inserta_un_codigo_que_otro_cargo_mientras_tanto(sqlite_engine, catalogo, monkeypatch):
    # Simula la carrera: el seed ya consultó qué códigos había, y antes de su
    # INSERT otro proceso carga uno de los mismos. ON CONFLICT lo saltea.
    car_models, parts = catalogo
    migrate(sqlite_engine)
    db = sessionmaker(bind=sqlite_engine)()
    original = seed.insert_ignoring

    def otro_proceso_carga_primero(session, model, *columns):
        if model is Part:
            session.execute(text(
                "INSERT INTO part (part_code, name, manufacturer, category, price, stock) "
                "VALUES (:code, 'De otro', 'Bosch', 'Filtros', 100, 1)"
            ), {"code": parts[0]["part_code"]})
        return original(session, model, *columns)

    monkeypatch.setattr(seed, "insert_ignoring", otro_proceso_carga_primero)
    _, nuevos, _ = seed.seed_catalog(db, car_models, parts)

    assert nuevos == len(parts) - 1
    assert counts(sqlite_engine)["part"] == len(parts)
    assert_relations_intact(sqlite_engine)


def test_los_seeds_no_corren_sobre_una_base_creada_con_create_all():
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    with pytest.raises(RuntimeError, match="alembic upgrade head"):
        require_head(engine)


def test_los_seeds_no_corren_sobre_una_base_atrasada(sqlite_engine):
    migrate(sqlite_engine, "0001")
    with pytest.raises(RuntimeError, match="revisión 0001"):
        require_head(sqlite_engine)

    migrate(sqlite_engine)
    require_head(sqlite_engine)


# ---------------------------------------------------------------- Postgres

postgres = pytest.mark.skipif(
    not TEST_POSTGRES_URL, reason="sin TEST_POSTGRES_URL (Postgres de prueba)"
)


@pytest.fixture
def pg_engine(monkeypatch):
    """Una base nueva en el servidor de TEST_POSTGRES_URL, solo para este test."""
    server = create_engine(TEST_POSTGRES_URL, isolation_level="AUTOCOMMIT", poolclass=NullPool)
    name = f"autobought_test_{uuid.uuid4().hex[:12]}"
    with server.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    engine = create_engine(make_url(TEST_POSTGRES_URL).set(database=name), poolclass=NullPool)
    # scripts.db_baseline usa el engine de la aplicación.
    monkeypatch.setattr("app.db.session.engine", engine)
    try:
        yield engine
    finally:
        engine.dispose()
        with server.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        server.dispose()


def table_oids(engine):
    with engine.connect() as connection:
        return dict(connection.execute(text(
            "SELECT relname, oid FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace"
        )).all())


@postgres
def test_pg_base_vacia_coincide_con_los_modelos(pg_engine):
    migrate(pg_engine)

    assert revision_of(pg_engine) == head_revision()
    # Lo mismo que `alembic check`: no queda nada por migrar.
    assert model_diff(pg_engine) == []


@postgres
def test_pg_la_baseline_es_el_esquema_de_create_all(pg_engine):
    legacy_schema(pg_engine)
    with pg_engine.begin() as connection:
        report = db_baseline.inspect_database(connection)

    assert report.matches, [db_baseline.describe(o) for o in report.missing + report.surplus + report.different]
    # El esquema temporal de la comparación no quedó.
    with pg_engine.connect() as connection:
        schemas = connection.execute(text("SELECT nspname FROM pg_namespace")).scalars().all()
    assert db_baseline.CHECK_SCHEMA not in schemas


@postgres
def test_pg_base_existente_se_incorpora_sin_recrear_tablas(pg_engine):
    legacy_schema(pg_engine)
    add_data(pg_engine)
    antes, oids = counts(pg_engine), table_oids(pg_engine)

    assert db_baseline.main(["stamp"]) == 0
    assert revision_of(pg_engine) == "0001"
    migrate(pg_engine)

    assert revision_of(pg_engine) == head_revision()
    # Las tablas que ya estaban son las mismas (no se recrearon); solo se
    # suman alembic_version y las de las migraciones siguientes.
    despues = table_oids(pg_engine)
    assert {tabla: despues[tabla] for tabla in oids} == oids
    assert set(despues) - set(oids) == {"alembic_version"} | TABLAS_POSTERIORES
    assert counts(pg_engine) == antes
    assert part_unique_constraints(pg_engine) == {"uq_part_part_code": ["part_code"]}
    assert_relations_intact(pg_engine)


@postgres
def test_pg_stamp_se_niega_si_el_esquema_no_coincide(pg_engine):
    # Como la base local de antes de Mercado Pago: con payment_method y sin payment.
    legacy_schema(pg_engine)
    add_data(pg_engine)
    with pg_engine.begin() as connection:
        connection.execute(text("DROP TABLE payment"))
        connection.execute(text("DROP TYPE payment_status"))
        connection.execute(text(
            "CREATE TABLE payment_method (payment_method_id SERIAL PRIMARY KEY, "
            "client_id INTEGER NOT NULL REFERENCES client(user_id), last_four VARCHAR(4) NOT NULL)"
        ))
        connection.execute(text("INSERT INTO payment_method (client_id, last_four) SELECT user_id, '4242' FROM client"))
        connection.execute(text(
            'ALTER TABLE "order" ADD COLUMN payment_method_id INTEGER '
            "REFERENCES payment_method(payment_method_id) ON DELETE SET NULL"
        ))

    assert db_baseline.main(["stamp"]) == 1
    assert revision_of(pg_engine) is None

    with pg_engine.begin() as connection:
        report = db_baseline.inspect_database(connection)
    assert [db_baseline.describe(o) for o in report.missing] == ["tabla payment"]
    assert {db_baseline.describe(o) for o in report.surplus} >= {
        "tabla payment_method", "columna order.payment_method_id",
    }
    assert report.different == []

    # completar agrega payment; lo que sobra queda, con sus datos.
    assert db_baseline.main(["completar"]) == 1  # todavía sobran cosas
    assert db_baseline.main(["stamp"]) == 1
    assert db_baseline.main(["stamp", "--permitir-sobrantes"]) == 0
    migrate(pg_engine)

    assert revision_of(pg_engine) == head_revision()
    # Autogenerate no propone borrar lo heredado (ni nada más).
    assert model_diff(pg_engine) == []
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM payment_method")).scalar_one() == 1
        assert connection.execute(text("SELECT count(*) FROM payment")).scalar_one() == 0
    assert_relations_intact(pg_engine)


@postgres
def test_pg_completar_agrega_las_columnas_viejas_y_pasa_a_jsonb(pg_engine):
    # Lo que antes hacía add_missing_columns.
    legacy_schema(pg_engine)
    with pg_engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE part DROP COLUMN description, DROP COLUMN warranty_months, "
            "DROP COLUMN warranty_provider, ALTER COLUMN specifications TYPE JSON"
        ))
        connection.execute(text('ALTER TABLE "user" DROP COLUMN session_version'))
        connection.execute(text(
            "INSERT INTO part (part_code, name, manufacturer, category, price, stock, specifications) "
            "VALUES ('FIL-0001', 'Filtro', 'Mann-Filter', 'Filtros', 1, 2, '[[\"Rosca\", \"M20\"]]')"
        ))
        connection.execute(text(
            "INSERT INTO \"user\" (user_type, username, password, name, email) "
            "VALUES ('user', 'viejo', 'x', 'Viejo', 'viejo@mail.com')"
        ))

    assert db_baseline.main(["completar"]) == 0
    assert db_baseline.main(["completar"]) == 0  # la segunda vez no hace nada

    columns = {c["name"]: c for c in inspect(pg_engine).get_columns("part")}
    assert {"description", "warranty_months", "warranty_provider"} <= set(columns)
    assert type(columns["specifications"]["type"]).__name__ == "JSONB"
    with pg_engine.connect() as connection:
        assert connection.execute(text('SELECT session_version FROM "user"')).scalar_one() == 0
        assert connection.execute(text("SELECT specifications FROM part")).scalar_one() == [["Rosca", "M20"]]
    assert db_baseline.main(["stamp"]) == 0


@postgres
def test_pg_base_vacia_o_ya_migrada_no_necesita_stamp(pg_engine):
    assert db_baseline.main(["stamp"]) == 0
    assert revision_of(pg_engine) is None  # vacía: se prepara con upgrade head

    migrate(pg_engine)
    assert db_baseline.main(["stamp"]) == 0
    assert revision_of(pg_engine) == head_revision()


@postgres
def test_pg_codigo_repetido_lo_rechaza_postgres(pg_engine):
    migrate(pg_engine)
    add_data_part(pg_engine, "FIL-0001")
    add_data_part(pg_engine, "FIL-0002")

    with pytest.raises(IntegrityError, match="uq_part_part_code"):
        add_data_part(pg_engine, "FIL-0001")

    with pg_engine.connect() as connection:
        constraint = connection.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'uq_part_part_code'"
        )).scalar_one()
    assert constraint == "UNIQUE (part_code)"
    assert counts(pg_engine)["part"] == 2


@postgres
def test_pg_0002_con_repetidos_no_deja_nada_a_medias(pg_engine):
    migrate(pg_engine, "0001")
    add_data_part(pg_engine, "FIL-0001")
    add_data_part(pg_engine, "FIL-0001")

    with pytest.raises(RuntimeError, match="repetidos"):
        migrate(pg_engine)

    assert revision_of(pg_engine) == "0001"
    assert part_unique_constraints(pg_engine) == {}
    assert counts(pg_engine)["part"] == 2


@postgres
def test_pg_downgrade_quita_la_restriccion_y_la_baseline(pg_engine):
    migrate(pg_engine)
    downgrade(pg_engine, "0001")
    assert part_unique_constraints(pg_engine) == {}
    add_data_part(pg_engine, "FIL-0001")
    add_data_part(pg_engine, "FIL-0001")  # sin la restricción, se puede

    with pg_engine.begin() as connection:
        connection.execute(text("DELETE FROM part"))
    downgrade(pg_engine, "base")
    assert set(inspect(pg_engine).get_table_names()) == {"alembic_version"}
    with pg_engine.connect() as connection:
        types = connection.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'")).scalars().all()
    assert types == []


@postgres
def test_pg_dos_seeds_a_la_vez_no_duplican(pg_engine, catalogo):
    car_models, parts = catalogo
    migrate(pg_engine)
    Session = sessionmaker(bind=pg_engine)
    barrera = threading.Barrier(2)
    resultados, errores = [], []

    def correr():
        db = Session()
        try:
            barrera.wait()
            resultados.append(seed.seed_catalog(db, car_models, parts))
        except Exception as error:  # se revisa abajo
            errores.append(error)
        finally:
            db.close()

    hilos = [threading.Thread(target=correr) for _ in range(2)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    assert errores == []
    # Uno cargó todo y el otro, al esperar el lock, no encontró nada que cargar.
    assert sorted(resultados) == [(0, 0, 0), (len(car_models), len(parts), 0)]
    tablas = counts(pg_engine)
    assert tablas["part"] == len(parts)
    assert tablas["car_model"] == len(car_models)
    assert tablas["compatibility"] == sum(len(p["compatibilities"]) for p in parts)
    assert_relations_intact(pg_engine)


@postgres
def test_pg_deshacer_la_0003_saca_empaquetando_del_enum(pg_engine):
    assert downgrade_0003_con_un_pedido_empaquetando(pg_engine) == "confirmed"
    with pg_engine.connect() as connection:
        valores = connection.execute(text("SELECT unnest(enum_range(NULL::order_status))::text")).scalars().all()
    assert valores == ["confirmed", "shipped", "delivered", "cancelled"]

    # Y se puede volver a aplicar.
    migrate(pg_engine)
    assert revision_of(pg_engine) == head_revision()
    assert model_diff(pg_engine) == []
