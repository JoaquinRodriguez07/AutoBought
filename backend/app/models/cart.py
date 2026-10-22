from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class Cart(Base):
    __tablename__ = "cart"

    client_id = Column(Integer, ForeignKey("client.user_id"), primary_key=True)
    # Último cambio de los items (lo actualiza crud/cart.py) y último
    # recordatorio de carrito abandonado: uno por cada vez que se abandona.
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    reminder_sent_at = Column(DateTime(timezone=True))

    client = relationship("Client", back_populates="cart")
    items = relationship(
        "CartItem",
        back_populates="cart",
        cascade="all, delete-orphan",
    )
