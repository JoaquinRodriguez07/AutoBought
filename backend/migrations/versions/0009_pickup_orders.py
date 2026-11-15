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
ORDER_STATUS = ("confirmed", "packing", "shipped", "ready_for_pickup", "delivered", "cancelled")


def upgrade():
    connection = op.get_bind()

    if connection.dialect.name != "postgresql":
        # SQLite
        new_status = sa.Enum(*ORDER_STATUS, name="order_status")

        for table in ("order", "order_status_history"):
            with op.batch_alter_table(table) as batch:
                batch.alter_column(
                    "status",
                    existing_type=sa.String(length=9),
                    type_=new_status,
                    existing_nullable=False
                )

        delivery_enum = sa.Enum(
            "shipping", "pickup", name="delivery_method"
        )

    else:
        # PostgreSQL
        op.execute(
            "ALTER TYPE order_status ADD VALUE IF NOT EXISTS "
            "'ready_for_pickup' AFTER 'shipped'"
        )

        delivery_enum = sa.Enum(
            "shipping", "pickup", name="delivery_method"
        )
        delivery_enum.create(connection, checkfirst=True)

    op.add_column(
        "order",
        sa.Column(
            "delivery_method",
            delivery_enum,
            nullable=False,
            server_default="shipping"
        )
    )

    with op.batch_alter_table("order") as batch:
        for field in (
            "ship_personal_name",
            "ship_street",
            "ship_number",
            "ship_city",
            "ship_department"
        ):
            batch.alter_column(
                field,
                existing_type=sa.String(
                    length=10 if field == "ship_number" else 50
                ),
                nullable=True
            )

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
