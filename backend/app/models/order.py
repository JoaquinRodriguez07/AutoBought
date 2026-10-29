import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class OrderStatus(str, enum.Enum):
    """Estado logístico del pedido. El estado del cobro va aparte, en
    `Payment`."""

    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class Order(Base):
    __tablename__ = "order"

    order_id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.user_id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    status = Column(
        Enum(
            OrderStatus,
            name="order_status",
            values_callable=lambda statuses: [status.value for status in statuses],
        ),
        nullable=False,
        default=OrderStatus.CONFIRMED,
        server_default=OrderStatus.CONFIRMED.value,
    )

    # Referencia a lo guardado en el perfil; queda en NULL si el cliente lo borra.
    shipping_address_id = Column(
        Integer,
        ForeignKey("shipping_address.shipping_address_id", ondelete="SET NULL"),
    )

    # Copia al momento de la compra (como frozen_price): el historial no cambia
    # aunque el cliente edite o borre su dirección. Los pedidos de antes de
    # Mercado Pago guardan acá la tarjeta que se usó.
    ship_personal_name = Column(String(50), nullable=False)
    ship_street = Column(String(50), nullable=False)
    ship_number = Column(String(10), nullable=False)
    ship_apartment = Column(String(10))
    ship_city = Column(String(50), nullable=False)
    ship_department = Column(String(50), nullable=False)
    ship_postal_code = Column(String(10))
    payment_method_label = Column(String(60), nullable=False)

    client = relationship("Client", back_populates="orders")
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    # Los pedidos de antes de Mercado Pago no tienen.
    payment = relationship(
        "Payment",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )
