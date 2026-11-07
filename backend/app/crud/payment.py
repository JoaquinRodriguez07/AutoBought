import logging
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.mercadopago import ClienteMercadoPago, MercadoPagoNoDisponible
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


def clave_devolucion(order_id: int) -> str:
    """La clave de idempotencia de la devolución de un pedido. Es la misma
    venga de donde venga (cancelación del vendedor, pago tardío sin stock o
    reintento del cron): Mercado Pago nunca devuelve dos veces el mismo pedido."""
    return f"autobought-devolucion-pedido-{order_id}"


def devolver(db: Session, payment: Payment, cliente_mp: ClienteMercadoPago) -> bool:
    """Devuelve el pago en Mercado Pago y anota cuándo. Si Mercado Pago falla,
    queda en el log y sin fecha: el cron lo vuelve a intentar. Devuelve si salió."""
    if payment.refunded_at is not None:
        return True
    if not payment.mp_payment_id:
        # Sin número de pago no hay qué devolver en Mercado Pago: va a mano.
        logger.warning("El pago del pedido %s no tiene número de Mercado Pago: devolver el dinero a mano.", payment.order_id)
        return False
    try:
        cliente_mp.devolver_pago(payment.mp_payment_id, clave_devolucion(payment.order_id))
    except MercadoPagoNoDisponible as error:
        logger.warning("No se pudo devolver el pago del pedido %s: %s", payment.order_id, error)
        return False
    marcar_devuelto(db, payment)
    db.commit()
    return True


def marcar_devuelto(db: Session, payment: Payment) -> None:
    """Anota que el pago ya se devolvió. No hace commit: lo hace quien llama."""
    payment.refunded_at = datetime.now(timezone.utc)


def pagos_por_devolver(db: Session) -> list[Payment]:
    """Pagos aprobados de pedidos que se cancelaron por vencidos (se pagaron
    tarde y no había stock) y que todavía no se devolvieron. Los que cancela
    el vendedor no entran: esos se devuelven antes de cancelar."""
    return list(
        db.scalars(
            select(Payment)
            .join(Order)
            .where(
                Payment.status == PaymentStatus.APPROVED,
                Payment.refunded_at.is_(None),
                Payment.mp_payment_id.is_not(None),
                Order.status == OrderStatus.CANCELLED,
                Order.cancellation_reason.is_(None),
            )
            .order_by(Payment.payment_id)
        )
    )


def devolver_pendientes(db: Session, cliente_mp: ClienteMercadoPago) -> int:
    """Tarea diaria: reintenta las devoluciones que fallaron. Devuelve cuántas salieron."""
    return sum(devolver(db, payment, cliente_mp) for payment in pagos_por_devolver(db))
