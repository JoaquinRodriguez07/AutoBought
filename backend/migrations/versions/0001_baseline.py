"""Baseline: el esquema tal como lo dejaban create_all y add_missing_columns
antes de incorporar Alembic.

Sobre una base vacía, crea todas las tablas. Una base que ya tenía este
esquema NO se migra con esta revisión: se verifica y se marca como aplicada
con `python -m scripts.db_baseline stamp` (ver README.md).

Las restricciones sin nombre quedan con el nombre que les pone Postgres
(user_email_key, favorite_client_id_part_id_key...), igual que con create_all.

Revision ID: 0001
Revises:
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

ORDER_STATUS = ("confirmed", "shipped", "delivered", "cancelled")
PAYMENT_STATUS = ("pending", "approved", "rejected")


def upgrade():
    op.create_table(
        "user",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_type", sa.String(length=20), nullable=False),
        sa.Column("username", sa.String(length=60), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("email_verified", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("session_version", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "car_model",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("brand", sa.String(length=60), nullable=False),
        sa.Column("model", sa.String(length=60), nullable=False),
        sa.Column("engine_code", sa.String(length=60), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "part",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("part_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("manufacturer", sa.String(length=60), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=40), nullable=True),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "specifications",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=True,
        ),
        sa.Column("warranty_months", sa.Integer(), nullable=True),
        sa.Column("warranty_provider", sa.String(length=20), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "auth_attempt",
        sa.Column("auth_attempt_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("first_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("auth_attempt_id"),
    )
    op.create_index("ix_auth_attempt_email", "auth_attempt", ["email"], unique=True)

    op.create_table(
        "client",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("marketing_emails", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "employee",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "uso_ia",
        sa.Column("uso_ia_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("funcionalidad", sa.String(length=40), nullable=False),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("uso_ia_id"),
    )
    op.create_index("ix_uso_ia_user_id", "uso_ia", ["user_id"], unique=False)

    op.create_table(
        "compatibility",
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("car_model_id", sa.Integer(), nullable=False),
        sa.Column("year_from", sa.Integer(), nullable=False),
        sa.Column("year_to", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["car_model_id"], ["car_model.id"]),
        sa.ForeignKeyConstraint(["part_id"], ["part.id"]),
        sa.PrimaryKeyConstraint("part_id", "car_model_id"),
    )
    op.create_table(
        "cart",
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["client.user_id"]),
        sa.PrimaryKeyConstraint("client_id"),
    )
    op.create_table(
        "cart_item",
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["cart_id"], ["cart.client_id"]),
        sa.ForeignKeyConstraint(["part_id"], ["part.id"]),
        sa.PrimaryKeyConstraint("cart_id", "part_id"),
    )
    op.create_table(
        "shipping_address",
        sa.Column("shipping_address_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("personal_name", sa.String(length=50), nullable=False),
        sa.Column("street", sa.String(length=50), nullable=False),
        sa.Column("city", sa.String(length=50), nullable=False),
        sa.Column("number", sa.String(length=10), nullable=False),
        sa.Column("apartment", sa.String(length=10), nullable=True),
        sa.Column("department", sa.String(length=50), nullable=False),
        sa.Column("postal_code", sa.String(length=10), nullable=True),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["client.user_id"]),
        sa.PrimaryKeyConstraint("shipping_address_id"),
    )
    # Como mucho una dirección principal por cliente.
    op.create_index(
        "uq_shipping_address_one_primary",
        "shipping_address",
        ["client_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
        sqlite_where=sa.text("is_primary"),
    )
    op.create_table(
        "order",
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(*ORDER_STATUS, name="order_status"),
            server_default="confirmed",
            nullable=False,
        ),
        sa.Column("shipping_address_id", sa.Integer(), nullable=True),
        sa.Column("ship_personal_name", sa.String(length=50), nullable=False),
        sa.Column("ship_street", sa.String(length=50), nullable=False),
        sa.Column("ship_number", sa.String(length=10), nullable=False),
        sa.Column("ship_apartment", sa.String(length=10), nullable=True),
        sa.Column("ship_city", sa.String(length=50), nullable=False),
        sa.Column("ship_department", sa.String(length=50), nullable=False),
        sa.Column("ship_postal_code", sa.String(length=10), nullable=True),
        sa.Column("payment_method_label", sa.String(length=60), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["client.user_id"]),
        sa.ForeignKeyConstraint(
            ["shipping_address_id"],
            ["shipping_address.shipping_address_id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("order_id"),
    )
    op.create_table(
        "order_item",
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("frozen_price", sa.Integer(), nullable=False),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["order.order_id"]),
        sa.ForeignKeyConstraint(["part_id"], ["part.id"]),
        sa.PrimaryKeyConstraint("order_id", "part_id"),
    )
    op.create_table(
        "payment",
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(*PAYMENT_STATUS, name="payment_status"),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("mp_preference_id", sa.String(length=100), nullable=True),
        sa.Column("mp_payment_id", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["order.order_id"]),
        sa.PrimaryKeyConstraint("payment_id"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_table(
        "favorite",
        sa.Column("favorite_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["client.user_id"]),
        sa.ForeignKeyConstraint(["part_id"], ["part.id"]),
        sa.PrimaryKeyConstraint("favorite_id"),
        sa.UniqueConstraint("client_id", "part_id"),
    )
    op.create_table(
        "stock_alert",
        sa.Column("stock_alert_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["client.user_id"]),
        sa.ForeignKeyConstraint(["part_id"], ["part.id"]),
        sa.PrimaryKeyConstraint("stock_alert_id"),
        sa.UniqueConstraint("client_id", "part_id"),
    )


def downgrade():
    for table in (
        "stock_alert", "favorite", "payment", "order_item", "order", "shipping_address",
        "cart_item", "cart", "compatibility", "uso_ia", "employee", "client",
        "auth_attempt", "part", "car_model", "user",
    ):
        op.drop_table(table)
    sa.Enum(name="payment_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="order_status").drop(op.get_bind(), checkfirst=True)
