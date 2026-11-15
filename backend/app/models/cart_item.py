"""ModelT de un repuesto dentro del carrito."""

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.db.base import Base


class CartItem(Base):
    __tablename__ = "cart_item"

    cart_id = Column(Integer, ForeignKey("cart.client_id"), primary_key=True)
    part_id = Column(Integer, ForeignKey("part.id"), primary_key=True)
    amount = Column(Integer, nullable=False)

    cart = relationship("Cart", back_populates="items")
    part = relationship("Part", back_populates="cart_items")
