from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from app.db.base import Base


class UsoIA(Base):
    """Una consulta a la IA: para el límite por usuario y para saber cuánto
    se usa (y cuánto cuesta) cada funcionalidad."""

    __tablename__ = "uso_ia"

    uso_ia_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    funcionalidad = Column(String(40), nullable=False)
    tokens = Column(Integer, nullable=False, default=0)
    ok = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
