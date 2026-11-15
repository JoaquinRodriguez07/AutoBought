"""ModelT del pedido y sus estados."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.payment import PaymentStatus


class OrderStatus(str, enum.Enum):
    """Estado logístico del pedido. El estado del cobro va aparte, en
    `Payment`. El vendedor lo avanza en este orden, de a un paso (ver
    `app.crud.order.change_status`); «cancelado» va aparte."""

    CONFIRMED = "confirmed"
    PACKING = "packing"
    SHIPPED = "shipped"
    READY_FOR_PICKUP = "ready_for_pickup"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class DeliveryMethod(str, enum.Enum):
    SHIPPING = "shipping"
    PICKUP = "pickup"


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

    delivery_method = Column(
        Enum(DeliveryMethod, name="delivery_method", values_callable=lambda values: [v.value for v in values]),
        nullable=False, default=DeliveryMethod.SHIPPING, server_default=DeliveryMethod.SHIPPING.value,
    )

    # Referencia a lo guardado en el perfil; queda en NULL si el cliente lo borra.
    shipping_address_id = Column(
        Integer,
        ForeignKey("shipping_address.shipping_address_id", ondelete="SET NULL"),
    )

    # Copia al momento de la compra (como frozen_price): el historial no cambia
    # aunque el cliente edite o borre su dirección. Los pedidos de antes de
    # Mercado Pago guardan acá la tarjeta que se usó.
    ship_personal_name = Column(String(50), nullable=True)
    ship_street = Column(String(50), nullable=True)
    ship_number = Column(String(10), nullable=True)
    ship_apartment = Column(String(10))
    ship_city = Column(String(50), nullable=True)
    ship_department = Column(String(50), nullable=True)
    ship_postal_code = Column(String(10))
    payment_method_label = Column(String(60), nullable=False)

    # Por qué lo canceló el vendedor: es algo excepcional (no había stock
    # real, el cliente se arrepintió...) y queda registrado. NULL en los
    # demás pedidos, incluidos los que se cancelaron solos por no pagarse.
    cancellation_reason = Column(String(200))

    # Nota de la tienda sobre el pedido ("entregar de tarde"). Solo la ve el
    # portal del vendedor: no va en el historial ni en los mails del cliente.
    internal_note = Column(String(500))

    client = relationship("Client", back_populates="orders")
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    # Los pedidos de antes de esta tabla (y los del seed de historial) no
    # tienen filas: ver `schemas.order.timeline`.
    status_history = relationship(
        "OrderStatusHistory",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="(OrderStatusHistory.changed_at, OrderStatusHistory.id)",
    )
    # Los pedidos de antes de Mercado Pago no tienen.
    payment = relationship(
        "Payment",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def is_paid(self) -> bool:
        """Pago aprobado, o sin pago (los pedidos de antes de Mercado Pago,
        que se cobraban con la tarjeta al comprar). Lo mismo que
        `app.crud.payment.is_paid_order`, pero en Python."""
        return self.payment is None or self.payment.status == PaymentStatus.APPROVED

    @property
    def total(self) -> int:
        """Lo que cuesta el pedido, con los precios del momento de la compra."""
        return sum(item.frozen_price * item.quantity for item in self.items)
