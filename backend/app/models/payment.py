import enum
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.core.config import MINUTOS_PARA_PAGAR
from app.db.base import Base


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Payment(Base):
    """El cobro de un pedido con Mercado Pago. La tarjeta se carga en
    Mercado Pago: acá solo quedan los ids para consultarlo."""

    __tablename__ = "payment"

    payment_id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("order.order_id"), nullable=False, unique=True)
    status = Column(
        Enum(
            PaymentStatus,
            name="payment_status",
            values_callable=lambda statuses: [status.value for status in statuses],
        ),
        nullable=False,
        default=PaymentStatus.PENDING,
        server_default=PaymentStatus.PENDING.value,
    )
    # La última preferencia (link de pago) creada; cambia en cada reintento.
    mp_preference_id = Column(String(100))
    # El pago de Mercado Pago que decidió el estado (aprobado o rechazado).
    mp_payment_id = Column(String(50))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
    )

    order = relationship("Order", back_populates="payment")

    @property
    def due_at(self) -> datetime:
        """Hasta cuándo se puede pagar el pedido: el plazo corre desde que se
        confirmó la compra, y no se reinicia al reintentar."""
        creado = self.created_at
        # SQLite devuelve las fechas sin zona; Postgres, con zona.
        if creado.tzinfo is None:
            creado = creado.replace(tzinfo=timezone.utc)
        return creado + timedelta(minutes=MINUTOS_PARA_PAGAR)
