"""Seguimiento del pedido: estado «Empaquetando» e historial de estados.

Agrega el valor `packing` al enum order_status y crea la tabla
order_status_history, donde queda cada cambio de estado con su fecha.

Los pedidos que ya existen no se completan acá: de ellos solo se sabe el
estado actual, no cuándo cambió. La API arma su línea de tiempo con la fecha
de compra y el estado actual (ver `schemas.order.linea_de_tiempo`).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

ORDER_STATUS_SIN_PACKING = ("confirmed", "shipped", "delivered", "cancelled")


def _es_postgres():
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if _es_postgres():
        # Desde Postgres 12 se puede dentro de la transacción; el valor nuevo
        # no se usa hasta el commit, y acá no hace falta.
        op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'packing' AFTER 'confirmed'")
        status_type = postgresql.ENUM(name="order_status", create_type=False)
    else:
        # En SQLite el enum es un VARCHAR sin restricción: no hay nada que cambiar.
        status_type = sa.Enum(
            "confirmed", "packing", "shipped", "delivered", "cancelled", name="order_status"
        )

    op.create_table(
        "order_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("status", status_type, nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["order.order_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])


def downgrade():
    op.drop_index("ix_order_status_history_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")

    op.execute("UPDATE \"order\" SET status = 'confirmed' WHERE status = 'packing'")
    if _es_postgres():
        # Postgres no deja sacar un valor de un enum: se recrea el tipo.
        valores = ", ".join(f"'{valor}'" for valor in ORDER_STATUS_SIN_PACKING)
        op.execute("ALTER TYPE order_status RENAME TO order_status_old")
        op.execute(f"CREATE TYPE order_status AS ENUM ({valores})")
        op.execute('ALTER TABLE "order" ALTER COLUMN status DROP DEFAULT')
        op.execute('ALTER TABLE "order" ALTER COLUMN status TYPE order_status USING status::text::order_status')
        op.execute("ALTER TABLE \"order\" ALTER COLUMN status SET DEFAULT 'confirmed'")
        op.execute("DROP TYPE order_status_old")
