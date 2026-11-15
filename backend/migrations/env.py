"""Entorno de Alembic: a qué base se conecta y contra qué modelos compara.

La conexión sale de DATABASE_URL (app/core/config.py), con el mismo engine
que usa el backend. Los tests (y scripts.db_baseline) pueden pasar una
conexión propia en config.attributes["connection"].
"""

from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  (registra todos los modelos en Base.metadata)
from app.db.base import Base
from app.db.migrations import include_object

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Contra esto compara `alembic revision --autogenerate`.
target_metadata = Base.metadata


def run_migrations_offline():
    """`alembic upgrade head --sql`: escribe el SQL en vez de ejecutarlo."""
    from app.core.config import DATABASE_URL

    if not DATABASE_URL:
        raise RuntimeError('Falta DATABASE_URL (ver README.md, "Base de datos y migraciones").')
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        # No proponer borrar payment_method y compañía (ver app/db/migrations.py).
        include_object=include_object,
        # SQLite (solo los tests) no tiene ALTER TABLE ADD CONSTRAINT: Alembic
        # copia la tabla. En Postgres los cambios son ALTER comunes.
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return

    from app.core.config import DATABASE_URL

    if not DATABASE_URL:
        raise RuntimeError('Falta DATABASE_URL (ver README.md, "Base de datos y migraciones").')
    from app.db.session import engine

    with engine.connect() as connection:
        _run(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
