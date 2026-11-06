"""Estado «empaquetando» (packing) y motivo de cancelación del vendedor.

- order_status: se agrega 'packing' entre 'confirmed' y 'shipped'. En
  Postgres ALTER TYPE ... ADD VALUE puede ir dentro de la transacción desde
  la versión 12; el valor nuevo no se usa en esta migración (no se podría
  hasta hacer commit). En SQLite el ENUM es un VARCHAR y no hay nada que hacer.
- order.cancellation_reason: por qué canceló el vendedor el pedido.

Downgrade: Postgres no deja sacar un valor de un ENUM, así que se recrea el
tipo sin 'packing'. Los pedidos que estaban empaquetándose vuelven a
'confirmed' (es el estado anterior: no se pierde el pedido, solo el paso).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

ORDER_STATUS_SIN_PACKING = ("confirmed", "shipped", "delivered", "cancelled")


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'packing' BEFORE 'shipped'")

    with op.batch_alter_table("order") as batch:
        batch.add_column(sa.Column("cancellation_reason", sa.String(length=200), nullable=True))


def downgrade():
    with op.batch_alter_table("order") as batch:
        batch.drop_column("cancellation_reason")

    # ::text para no depender de que el tipo tenga el valor (y funciona igual en SQLite).
    op.execute("UPDATE \"order\" SET status = 'confirmed' WHERE CAST(status AS TEXT) = 'packing'")

    if op.get_bind().dialect.name == "postgresql":
        valores = ", ".join(f"'{valor}'" for valor in ORDER_STATUS_SIN_PACKING)
        op.execute('ALTER TABLE "order" ALTER COLUMN status DROP DEFAULT')
        op.execute("ALTER TYPE order_status RENAME TO order_status_con_packing")
        op.execute(f"CREATE TYPE order_status AS ENUM ({valores})")
        op.execute('ALTER TABLE "order" ALTER COLUMN status TYPE order_status USING status::text::order_status')
        op.execute("ALTER TABLE \"order\" ALTER COLUMN status SET DEFAULT 'confirmed'")
        op.execute("DROP TYPE order_status_con_packing")
