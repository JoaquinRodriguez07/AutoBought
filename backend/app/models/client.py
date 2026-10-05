from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.user import User


class Client(User):
    __tablename__ = "client"

    user_id = Column(Integer, ForeignKey("user.user_id"), primary_key=True)
    # Nullable: los clientes creados antes de esta columna (y los seeds)
    # no tienen teléfono.
    phone = Column(String(30), nullable=True)
    payment_methods = relationship(
        "PaymentMethod",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    shipping_addresses = relationship(
        "ShippingAddress",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    cart = relationship(
        "Cart",
        back_populates="client",
        uselist=False,
        cascade="all, delete-orphan",
    )
    orders = relationship("Order", back_populates="client")
    __mapper_args__ = {"polymorphic_identity": "client"}
