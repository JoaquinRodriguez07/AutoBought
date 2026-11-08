"""ModelT del historial de estados de un pedido."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.order import OrderStatus


class CancelReason(str, enum.Enum):
    """Por qué se canceló un pedido (solo en las filas de «cancelado»)."""

    EXPIRED = "expired"  # venció el plazo sin pagarse
    STORE = "store"  # lo canceló la tienda


class OrderStatusHistory(Base):
    """Cada cambio de estado de un pedido, con su fecha: de acá sale la
    línea de tiempo que ve el cliente. Los cambios se registran con
    `crud.order.change_status`; no cambiar `order.status` a mano."""

    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("order.order_id", ondelete="CASCADE"), nullable=False, index=True)
    # El mismo tipo que order.status (en Postgres, el enum order_status).
    status = Column(
        Enum(
            OrderStatus,
            name="order_status",
            values_callable=lambda statuses: [status.value for status in statuses],
        ),
        nullable=False,
    )
    reason = Column(String(20))
    changed_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

    order = relationship("Order", back_populates="status_history")
