"""Método de entrega y estado listo para retirar.

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup'")
        delivery_enum = sa.Enum("shipping", "pickup", name="delivery_method")
        delivery_enum.create(connection, checkfirst=True)
    else:
        delivery_enum = sa.Enum("shipping", "pickup", name="delivery_method")
    op.add_column("order", sa.Column("delivery_method", delivery_enum, nullable=False, server_default="shipping"))
    with op.batch_alter_table("order") as batch:
        for field in ("ship_personal_name", "ship_street", "ship_number", "ship_city", "ship_department"):
            batch.alter_column(field, existing_type=sa.String(length=10 if field == "ship_number" else 50), nullable=True)


def downgrade():
    connection = op.get_bind()
    # No se puede volver atrás con retiros todavía presentes.
    op.execute("UPDATE \"order\" SET status='packing' WHERE status='ready_for_pickup'")
    op.execute("UPDATE order_status_history SET status='packing' WHERE status='ready_for_pickup'")
    op.execute("UPDATE \"order\" SET delivery_method='shipping' WHERE delivery_method='pickup'")
    for field in ("ship_personal_name", "ship_street", "ship_number", "ship_city", "ship_department"):
        op.execute(f"UPDATE \"order\" SET {field} = '' WHERE {field} IS NULL")
    with op.batch_alter_table("order") as batch:
        for field in ("ship_personal_name", "ship_street", "ship_number", "ship_city", "ship_department"):
            batch.alter_column(field, existing_type=sa.String(length=10 if field == "ship_number" else 50), nullable=False)
    op.drop_column("order", "delivery_method")
    if connection.dialect.name == "postgresql":
        sa.Enum("shipping", "pickup", name="delivery_method").drop(connection, checkfirst=True)
        # PostgreSQL no permite DROP VALUE; se conserva el valor no utilizado.
