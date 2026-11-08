"""Modelo de los resúmenes del dashboard hechos con IA (HU 6.3)."""

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, func

from app.db.base import Base


class DashboardSummary(Base):
    """Un resumen generado. Nunca se pisa: cada uno es una fila nueva, así
    el vendedor puede ver los anteriores (el historial) y el dashboard
    muestra el más reciente sin volver a llamar a la IA."""

    __tablename__ = "dashboard_summary"

    id = Column(Integer, primary_key=True)
    # Los puntos del resumen (de 3 a 5 textos). JSON sirve igual en
    # Postgres y en SQLite, y nunca se busca adentro.
    points = Column(JSON, nullable=False)
    # Para saber cuánto cuesta cada resumen, además de uso_ia.
    tokens = Column(Integer, nullable=False, default=0)
    # Quién lo pidió. Si se da de baja al vendedor, el resumen queda.
    generated_by = Column(Integer, ForeignKey("user.user_id", ondelete="SET NULL"))
    # Indexado: el dashboard siempre busca el último y el historial ordena por acá.
    generated_at = Column(
        DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now(), index=True
    )
