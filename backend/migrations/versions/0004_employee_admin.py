"""Equipo de vendedores: rol administrador y baja de vendedores.

Agrega a employee:
- is_admin: puede dar de alta y de baja vendedores.
- active: false cuando se lo da de baja (no se borra la fila).

Para que toda base tenga quien gestione el equipo, el vendedor más antiguo
pasa a ser administrador.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("employee") as batch:
        batch.add_column(sa.Column("is_admin", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch.add_column(sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False))

    op.execute(
        "UPDATE employee SET is_admin = TRUE "
        "WHERE user_id = (SELECT MIN(user_id) FROM employee)"
    )


def downgrade():
    with op.batch_alter_table("employee") as batch:
        batch.drop_column("active")
        batch.drop_column("is_admin")
