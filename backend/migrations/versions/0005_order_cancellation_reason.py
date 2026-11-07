"""Motivo de cancelación del vendedor.

- order.cancellation_reason: el texto con el que el vendedor explica por qué
  canceló el pedido. Le llega al cliente en el mail y lo ve en su pedido.
  El estado «empaquetando» ya lo agrega la 0003, y el tipo de cancelación
  (venció o la canceló la tienda) queda en order_status_history.

Downgrade: se saca la columna (se pierden los motivos escritos).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("order") as batch:
        batch.add_column(sa.Column("cancellation_reason", sa.String(length=200), nullable=True))


def downgrade():
    with op.batch_alter_table("order") as batch:
        batch.drop_column("cancellation_reason")
