"""Nota interna del pedido.

- order.internal_note: lo que la tienda anota sobre un pedido ("entregar de
  tarde"). Solo la ve el portal del vendedor.

Downgrade: se saca la columna (se pierden las notas).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("order") as batch:
        batch.add_column(sa.Column("internal_note", sa.String(length=500), nullable=True))


def downgrade():
    with op.batch_alter_table("order") as batch:
        batch.drop_column("internal_note")
