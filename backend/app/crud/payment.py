from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.crud.order import reactivate_paid_order
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus

# Estados de Mercado Pago que cierran el intento como rechazado. Los demás
# (pending, in_process...) todavía pueden terminar aprobados: no cambian nada.
MP_REJECTED_STATUSES = {"rejected", "cancelled"}


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
    db: Session, order_id: int, mp_payment_id: str, mp_status: str
) -> tuple[Payment | None, bool]:
    """Actualiza el pago del pedido con el estado que dio Mercado Pago.

    Devuelve (pago, recién aprobado). Un pago aprobado ya no cambia: un aviso
    repetido, o el de un intento rechazado que llega tarde, no hace nada.
    Si el pedido ya se había cancelado por no pagarse a tiempo, se reactiva
    cuando hay stock; si no, el pago queda aprobado pero no cuenta como
    recién aprobado (no sale el mail de la compra).
    """
    payment = db.scalar(
        select(Payment).where(Payment.order_id == order_id).with_for_update()
    )
    if payment is None or payment.status == PaymentStatus.APPROVED:
        return payment, False

    if mp_status == "approved":
        payment.status = PaymentStatus.APPROVED
    elif mp_status in MP_REJECTED_STATUSES:
        payment.status = PaymentStatus.REJECTED
    else:
        return payment, False

    payment.mp_payment_id = mp_payment_id
    recien_aprobado = payment.status == PaymentStatus.APPROVED
    if recien_aprobado and payment.order.status == OrderStatus.CANCELLED:
        recien_aprobado = reactivate_paid_order(db, payment.order)
    db.commit()
    db.refresh(payment)
    return payment, recien_aprobado
