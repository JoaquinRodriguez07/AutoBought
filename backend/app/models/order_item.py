from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.db.base import Base


class OrderItem(Base):
    __tablename__ = "order_item"

    order_id = Column(Integer, ForeignKey("order.order_id"), primary_key=True)
    part_id = Column(Integer, ForeignKey("part.id"), primary_key=True)
    quantity = Column(Integer, nullable=False)
    frozen_price = Column(Integer, nullable=False)
    # Cuándo se mandó el recordatorio de mantenimiento de este repuesto.
    reminder_sent_at = Column(DateTime(timezone=True))

    order = relationship("Order", back_populates="items")
    part = relationship("Part", back_populates="order_items")
