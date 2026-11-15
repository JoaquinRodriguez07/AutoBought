"""Código de repuesto único: UNIQUE sobre part.part_code.

Antes de agregar la restricción, se fija si hay códigos repetidos y, si hay,
falla sin tocar nada y los lista. No se borran ni se cambian repuestos acá:
cada repetido puede tener pedidos, carritos, favoritos o compatibilidades
apuntándole, y hay que decidir a mano cuál queda (ver README.md,
"Códigos de repuesto repetidos").

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

CONSTRAINT = "uq_part_part_code"

DUPLICATES = sa.text(
    "SELECT part_code, COUNT(*) AS repeticiones FROM part "
    "GROUP BY part_code HAVING COUNT(*) > 1 ORDER BY part_code"
)


def upgrade():
    # Con --sql no hay base que consultar: el ALTER falla solo si hay repetidos.
    duplicates = [] if op.get_context().as_sql else op.get_bind().execute(DUPLICATES).all()
    if duplicates:
        listado = ", ".join(f"{code} ({count} veces)" for code, count in duplicates[:20])
        raise RuntimeError(
            f"Hay {len(duplicates)} códigos de repuesto repetidos: {listado}. "
            "No se agregó la restricción ni se cambió nada. Ver README.md, "
            '"Códigos de repuesto repetidos".'
        )
    with op.batch_alter_table("part") as batch:
        batch.create_unique_constraint(CONSTRAINT, ["part_code"])


def downgrade():
    with op.batch_alter_table("part") as batch:
        batch.drop_constraint(CONSTRAINT, type_="unique")
