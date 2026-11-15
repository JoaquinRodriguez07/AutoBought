"""Fecha de devolución del pago.

- payment.refunded_at: cuándo se le devolvió el dinero al cliente en Mercado
  Pago. Sirve para no devolver dos veces, para que el cron reintente las
  devoluciones que fallaron y para que el vendedor vea si ya se devolvió.

Downgrade: se saca la columna.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("payment") as batch:
        batch.add_column(sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table("payment") as batch:
        batch.drop_column("refunded_at")
