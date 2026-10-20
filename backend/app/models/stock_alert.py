from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class StockAlert(Base):
    """Un cliente pidió que le avisen cuando un repuesto agotado vuelva a
    tener stock. Se borra al mandar el aviso: avisa una sola vez."""

    __tablename__ = "stock_alert"
    __table_args__ = (UniqueConstraint("client_id", "part_id"),)

    stock_alert_id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.user_id"), nullable=False)
    part_id = Column(Integer, ForeignKey("part.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

    client = relationship("Client")
    part = relationship("Part")
