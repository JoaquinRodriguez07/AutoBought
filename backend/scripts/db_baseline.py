"""Incorpora a Alembic una base que ya existía (creada con create_all y
add_missing_columns, antes de las migraciones), sin recrear tablas ni
tocar los datos.

Usage:
    python -m scripts.db_baseline check       # solo mira: ¿coincide con la baseline?
    python -m scripts.db_baseline completar   # agrega lo que le falta (nunca borra)
    python -m scripts.db_baseline stamp       # verifica y la marca en la baseline (0001)

Después del stamp, `alembic upgrade head` aplica las migraciones siguientes.

Cómo verifica: dentro de una transacción, crea un esquema temporal, le aplica
la migración 0001 y compara la base contra ese resultado con el comparador
de Alembic (tablas, columnas, tipos, nulos, defaults, claves, índices). Al
terminar la transacción se deshace: el esquema temporal nunca queda guardado.
Solo Postgres (las bases SQLite son de los tests).

Lo que falta (tablas, columnas, índices, restricciones) lo puede agregar
`completar`, que solo hace CREATE y ADD. Lo que sobra (por ejemplo la tabla
payment_method, de antes de Mercado Pago) no se borra: se informa, y `stamp`
solo sigue con --permitir-sobrantes. Lo que es distinto (otro tipo, otro
nulo) hay que resolverlo a mano.
"""

import argparse
import sys
from dataclasses import dataclass, field

from alembic import command
from alembic.autogenerate import produce_migrations
from alembic.operations import Operations, ops
from alembic.runtime.migration import MigrationContext
from sqlalchemy import JSON, MetaData, text
from sqlalchemy.dialects.postgresql import JSONB

from app.db.migrations import alembic_config, current_revision

BASELINE = "0001"
CHECK_SCHEMA = "alembic_baseline_check"

ADDITIVE = (
    ops.CreateTableOp,
    ops.AddColumnOp,
    ops.CreateIndexOp,
    ops.CreateUniqueConstraintOp,
    ops.CreateForeignKeyOp,
)
SURPLUS = (ops.DropTableOp, ops.DropColumnOp, ops.DropIndexOp, ops.DropConstraintOp)


@dataclass
class Report:
    revision: str | None = None
    empty: bool = False
    missing: list = field(default_factory=list)
    surplus: list = field(default_factory=list)
    different: list = field(default_factory=list)
    duplicate_codes: list = field(default_factory=list)

    @property
    def matches(self):
        return not (self.missing or self.surplus or self.different)


def baseline_metadata(connection):
    """El esquema de la revisión 0001, reflejado de un esquema temporal que se
    deshace antes de volver."""
    original_path = connection.execute(text("SHOW search_path")).scalar_one()
    savepoint = connection.begin_nested()
    try:
        connection.execute(text(f"CREATE SCHEMA {CHECK_SCHEMA}"))
        connection.execute(text(f"SET LOCAL search_path TO {CHECK_SCHEMA}"))
        command.upgrade(alembic_config(connection), BASELINE)
        reference = MetaData()
        reference.reflect(bind=connection)
        reference.remove(reference.tables["alembic_version"])
    finally:
        savepoint.rollback()
        connection.execute(text(f"SET LOCAL search_path TO {original_path}"))
    return reference


def _flatten(operations):
    for operation in operations:
        if isinstance(operation, ops.ModifyTableOps):
            yield from _flatten(operation.ops)
        else:
            yield operation


def compare(connection, reference):
    context = MigrationContext.configure(
        connection, opts={"compare_type": True, "compare_server_default": True}
    )
    return list(_flatten(produce_migrations(context, reference).upgrade_ops.ops))


def _is_json_to_jsonb(operation):
    """part.specifications se creó como JSON en las bases más viejas;
    add_missing_columns la pasaba a JSONB."""
    return (
        isinstance(operation, ops.AlterColumnOp)
        and isinstance(operation.existing_type, JSON)
        and not isinstance(operation.existing_type, JSONB)
        and isinstance(operation.modify_type, JSONB)
        and operation.modify_nullable is None
        and operation.modify_server_default is False
        and operation.modify_name is None
    )


def describe(operation):
    match operation:
        case ops.CreateTableOp():
            return f"tabla {operation.table_name}"
        case ops.DropTableOp():
            return f"tabla {operation.table_name}"
        case ops.AddColumnOp():
            return f"columna {operation.table_name}.{operation.column.name}"
        case ops.DropColumnOp():
            return f"columna {operation.table_name}.{operation.column_name}"
        case ops.CreateIndexOp() | ops.DropIndexOp():
            return f"índice {operation.index_name} de {operation.table_name}"
        case ops.AddConstraintOp() | ops.DropConstraintOp():
            return f"restricción {operation.constraint_name} de {operation.table_name}"
        case ops.AlterColumnOp():
            cambios = []
            if operation.modify_type is not None:
                cambios.append(f"tipo {operation.existing_type} (esperado {operation.modify_type})")
            if operation.modify_nullable is not None:
                cambios.append(
                    "admite nulos (esperado NOT NULL)" if not operation.modify_nullable
                    else "no admite nulos (esperado NULL)"
                )
            if operation.modify_server_default is not False:
                cambios.append(
                    f"default {operation.existing_server_default!r} (esperado {operation.modify_server_default!r})"
                )
            return f"columna {operation.table_name}.{operation.column_name}: " + ", ".join(cambios)
    return str(operation.to_diff_tuple())


def duplicate_part_codes(connection):
    return connection.execute(text(
        "SELECT part_code, COUNT(*) FROM part GROUP BY part_code HAVING COUNT(*) > 1 ORDER BY part_code"
    )).all()


def inspect_database(connection):
    """Arma el informe. No deja nada cambiado."""
    if connection.dialect.name != "postgresql":
        raise RuntimeError("scripts.db_baseline es solo para Postgres.")
    report = Report(revision=current_revision(connection))
    if report.revision is not None:
        return report
    tables = connection.execute(text(
        "SELECT count(*) FROM information_schema.tables "
        "WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'"
    )).scalar_one()
    if tables == 0:
        report.empty = True
        return report

    for operation in compare(connection, baseline_metadata(connection)):
        if isinstance(operation, ADDITIVE) or _is_json_to_jsonb(operation):
            report.missing.append(operation)
        elif isinstance(operation, SURPLUS):
            report.surplus.append(operation)
        else:
            report.different.append(operation)
    if "part" in {o.table_name for o in report.missing if isinstance(o, ops.CreateTableOp)}:
        return report
    report.duplicate_codes = duplicate_part_codes(connection)
    return report


def complete(connection):
    """Agrega lo que le falta a la base para coincidir con la baseline. Solo
    CREATE TABLE, ADD COLUMN, índices, restricciones y JSON -> JSONB."""
    report = inspect_database(connection)
    operations = Operations(MigrationContext.configure(connection))
    for operation in report.missing:
        if _is_json_to_jsonb(operation):
            operations.alter_column(
                operation.table_name,
                operation.column_name,
                type_=JSONB(),
                postgresql_using=f"{operation.column_name}::jsonb",
            )
        else:
            operations.invoke(operation)
    return report.missing


def print_report(report):
    if report.revision is not None:
        print(f"La base ya está bajo Alembic (revisión {report.revision}). Usá `alembic upgrade head`.")
        return
    if report.empty:
        print("La base no tiene tablas: preparala con `alembic upgrade head` (no hace falta stamp).")
        return
    for title, items in (
        ("Faltan (`completar` las agrega)", report.missing),
        ("Sobran (no se borran; `stamp --permitir-sobrantes` para seguir igual)", report.surplus),
        ("Son distintas (hay que resolverlas a mano)", report.different),
    ):
        if items:
            print(f"{title}:")
            for operation in items:
                print(f"  - {describe(operation)}")
    if report.matches:
        print(f"El esquema coincide con la baseline ({BASELINE}).")
    if report.duplicate_codes:
        print(
            f"Hay {len(report.duplicate_codes)} códigos de repuesto repetidos (la migración 0002 "
            "no se va a poder aplicar hasta resolverlos; ver README.md):"
        )
        for code, count in report.duplicate_codes[:50]:
            print(f"  - {code}: {count} repuestos")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("accion", choices=["check", "completar", "stamp"])
    parser.add_argument(
        "--permitir-sobrantes",
        action="store_true",
        help="hacer el stamp aunque la base tenga tablas o columnas que la baseline no tiene",
    )
    args = parser.parse_args(argv)

    from app.db.session import engine

    with engine.connect() as connection:
        if args.action_name == "completar":
            # Todo o nada: si algo falla (por ejemplo, una columna NOT NULL sin
            # default en una tabla con filas), no queda nada a medias.
            with connection.begin():
                added = complete(connection)
            for operation in added:
                print(f"Agregado: {describe(operation)}")
            if not added:
                print("No falta nada.")

        with connection.begin() as transaction:
            report = inspect_database(connection)
            transaction.rollback()

        print_report(report)
        if args.action_name != "stamp" or report.revision is not None or report.empty:
            return 0 if report.revision is not None or report.empty or report.matches else 1
        if report.missing or report.different:
            print("No se hizo el stamp: primero resolvé lo de arriba.")
            return 1
        if report.surplus and not args.permitir_sobrantes:
            print("No se hizo el stamp: la base tiene cosas que la baseline no tiene (ver arriba).")
            return 1
        with connection.begin():
            command.stamp(alembic_config(connection), BASELINE)
        print(f"Base marcada en la revisión {BASELINE}. Ahora: `alembic upgrade head`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
