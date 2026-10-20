from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, true
from sqlalchemy.orm import relationship

from app.models.user import User


class Client(User):
    __tablename__ = "client"

    user_id = Column(Integer, ForeignKey("user.user_id"), primary_key=True)
    # Nullable: los clientes creados antes de esta columna (y los seeds)
    # no tienen teléfono.
    phone = Column(String(30), nullable=True)
    # Mails comerciales (carrito abandonado, mantenimiento, baja de precio).
    # Los de la cuenta y los pedidos se mandan siempre.
    marketing_emails = Column(Boolean, nullable=False, default=True, server_default=true())
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
    favorites = relationship(
        "Favorite",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    __mapper_args__ = {"polymorphic_identity": "client"}
