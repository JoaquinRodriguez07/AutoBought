import logging

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.crud.order import reactivate_paid_order
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus

# Estados de Mercado Pago que cierran el intento como rechazado. Los demás
# (pending, in_process...) todavía pueden terminar aprobados: no cambian nada.
MP_REJECTED_STATUSES = {"rejected", "cancelled"}

logger = logging.getLogger(__name__)


def _monto_correcto(monto: float | None, total: int) -> bool:
    # Mercado Pago manda el monto con decimales (3000.0); los precios son enteros.
    return monto is not None and round(monto, 2) == total


def get_payment_for_client(db: Session, order_id: int, client_id: int) -> Payment | None:
    query = (
        select(Payment)
        .join(Order)
        .where(Payment.order_id == order_id, Order.client_id == client_id)
    )
    return db.scalar(query)


def is_paid_order():
    """Condición para contar un pedido como venta: pago aprobado, o sin pago
    (los pedidos de antes de Mercado Pago). Pide un outer join con Payment."""
    return or_(Payment.payment_id.is_(None), Payment.status == PaymentStatus.APPROVED)


def set_preference(db: Session, payment: Payment, preference_id: str) -> Payment:
    payment.mp_preference_id = preference_id
    # Un link nuevo es un intento nuevo: hasta que Mercado Pago diga otra
    # cosa, el pedido no está rechazado. Si no, al volver de pagar bien se
    # vería el rechazo del intento anterior y el cliente podría pagar dos veces.
    if payment.status == PaymentStatus.REJECTED:
        payment.status = PaymentStatus.PENDING
    db.commit()
    db.refresh(payment)
    return payment


def apply_mp_status(
    db: Session, order_id: int, mp_payment_id: str, mp_status: str, mp_amount: float | None
) -> tuple[Payment | None, bool]:
    """Actualiza el pago del pedido con el estado que dio Mercado Pago.

    Devuelve (pago, recién aprobado). Un pago aprobado ya no cambia: un aviso
    repetido, o el de un intento rechazado que llega tarde, no hace nada.
    Si el pedido ya se había cancelado por no pagarse a tiempo, se reactiva
    cuando hay stock; si no, el pago queda aprobado y el pedido cancelado
    (quien llama ve el estado del pedido para saber qué mail mandar).
    Un pago aprobado por un monto distinto al total del pedido queda
    rechazado y en el log: no se da por pagado un pedido cobrado de menos.
    """
    payment = db.scalar(
        select(Payment).where(Payment.order_id == order_id).with_for_update()
    )
    if payment is None or payment.status == PaymentStatus.APPROVED:
        return payment, False

    if mp_status == "approved" and not _monto_correcto(mp_amount, payment.order.total):
        logger.warning(
            "El pago %s del pedido %s se aprobó por %s, pero el pedido cuesta %s: queda rechazado.",
            mp_payment_id,
            order_id,
            mp_amount,
            payment.order.total,
        )
        payment.status = PaymentStatus.REJECTED
    elif mp_status == "approved":
        payment.status = PaymentStatus.APPROVED
    elif mp_status in MP_REJECTED_STATUSES:
        payment.status = PaymentStatus.REJECTED
    else:
        return payment, False

    payment.mp_payment_id = mp_payment_id
    recien_aprobado = payment.status == PaymentStatus.APPROVED
    if recien_aprobado and payment.order.status == OrderStatus.CANCELLED:
        reactivate_paid_order(db, payment.order)
    db.commit()
    db.refresh(payment)
    return payment, recien_aprobado
