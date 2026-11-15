"""Resúmenes del dashboard con IA (HU 6.3).

- dashboard_summary: cada resumen generado, con sus puntos, los tokens, quién
  lo pidió y cuándo. Nunca se pisa, así se puede ver el historial; la tarea
  diaria borra los más viejos que IA_RESUMEN_DIAS_HISTORIAL.

Downgrade: se borra la tabla (y con ella el historial de resúmenes).

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-08
"""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dashboard_summary",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("points", sa.JSON(), nullable=False),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("generated_by", sa.Integer(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["generated_by"], ["user.user_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dashboard_summary_generated_at", "dashboard_summary", ["generated_at"])


def downgrade():
    op.drop_index("ix_dashboard_summary_generated_at", table_name="dashboard_summary")
    op.drop_table("dashboard_summary")
