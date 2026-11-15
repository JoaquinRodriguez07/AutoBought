"""Acceso a las migraciones de Alembic desde el código (scripts y tests).

El esquema de la base lo manejan las migraciones de backend/migrations/:
`uv run alembic upgrade head`. Los scripts que cargan datos no crean ni
cambian tablas: con require_head se niegan a correr sobre una base que no
está al día.
"""

from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

# Restos de las tarjetas guardadas (antes de Mercado Pago) que quedan en las
# bases viejas, con sus datos: se decidió conservarlos. Ningún modelo los
# tiene, así que autogenerate propondría borrarlos; include_object hace que
# los ignore. Borrarlos de verdad sería una migración escrita a propósito.
LEGACY_TABLES = {"payment_method"}
LEGACY_COLUMNS = {("order", "payment_method_id")}
LEGACY_CONSTRAINTS = {"order_payment_method_id_fkey"}


def include_object(object, name, type_, reflected, compare_to):
    """Para autogenerate y `alembic check`: deja afuera lo heredado que
    existe en la base y no en los modelos."""
    if not reflected or compare_to is not None:
        return True
    if type_ == "table":
        return name not in LEGACY_TABLES
    if type_ == "column":
        return (object.table.name, name) not in LEGACY_COLUMNS
    if object.table.name in LEGACY_TABLES or name in LEGACY_CONSTRAINTS:
        return False
    return True


def alembic_config(connection=None):
    """La configuración de alembic.ini. Con `connection`, las migraciones
    corren sobre esa conexión (y su transacción) en vez de DATABASE_URL."""
    config = Config(str(ALEMBIC_INI))
    # Desde código no se toca el logging de quien llama (pytest, scripts).
    config.attributes["configure_logger"] = False
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def head_revision():
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def current_revision(connection):
    """La revisión aplicada, o None si la base no está bajo Alembic."""
    return MigrationContext.configure(connection).get_current_revision()


def require_head(engine):
    with engine.connect() as connection:
        current = current_revision(connection)
    head = head_revision()
    if current != head:
        raise RuntimeError(
            f"La base está en la revisión {current or 'ninguna'} y la última es {head}. "
            "Primero preparala con `uv run alembic upgrade head` (si es una base que ya "
            "existía antes de Alembic, ver `python -m scripts.db_baseline check`)."
        )
