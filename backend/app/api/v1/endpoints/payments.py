import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core.config import BACKEND_URL, FRONTEND_URL, CURRENCY
from app.core.mercadopago import MercadoPagoClient, MercadoPagoUnavailable, valid_signature, get_mp_client
from app.core.notifications import notify_purchase, notify_paid_without_stock
from app.crud import order as crud_order
from app.crud import payment as crud_payment
from app.models.client import Client
from app.models.order import OrderStatus
from app.models.payment import PaymentStatus

router = APIRouter(prefix="/pagos", tags=["pagos"])
logger = logging.getLogger(__name__)

class PaymentLinkOut(BaseModel):
    url: str


class VerifyPaymentIn(BaseModel):
    payment_id: str


class PaymentStatusOut(BaseModel):
    estado: PaymentStatus


def _build_preference(order) -> dict:
    """La preferencia de Mercado Pago: qué se cobra y adónde vuelve el cliente.
    El número de pedido va en `external_reference`, y vuelve en cada pago."""
    volver = f"{FRONTEND_URL}/pago?pedido={order.order_id}"
    preference = {
        "items": [
            {
                "id": str(item.part_id),
                "title": item.part.name,
                "quantity": item.quantity,
                "unit_price": item.frozen_price,
                "currency_id": CURRENCY,
            }
            for item in order.items
        ],
        "external_reference": str(order.order_id),
        "back_urls": {"success": volver, "failure": volver, "pending": volver},
        # El link deja de servir cuando vence el pedido: nadie paga un pedido
        # que ya se canceló y devolvió su stock.
        "expires": True,
        "expiration_date_to": order.payment.due_at.isoformat(timespec="milliseconds"),
        # Sin efectivo (Abitab, RedPagos): se paga horas después y el pedido
        # ya se habría cancelado por no pagarse a tiempo.
        "payment_methods": {"excluded_payment_types": [{"id": "ticket"}]},
    }
    # Mercado Pago solo vuelve solo (sin que el cliente toque "Volver al
    # sitio") a direcciones https; en local el cliente vuelve con el botón.
    if volver.startswith("https://"):
        preference["auto_return"] = "approved"
    # Sin dirección pública (en local) Mercado Pago no tiene adónde avisar.
    if BACKEND_URL:
        preference["notification_url"] = f"{BACKEND_URL}/api/v1/pagos/webhook"
    return preference


def _notify_approved_payment(
    db: Session, order, background_tasks: BackgroundTasks, mp_client: MercadoPagoClient
) -> None:
    """El mail de la compra o, si el pedido había vencido y ya no hay stock
    (sigue cancelado), se le devuelve el dinero y se le avisa. Si Mercado
    Pago no devuelve ahora, el cron lo reintenta: el mail sale igual."""
    if order.status == OrderStatus.CANCELLED:
        crud_payment.refund(db, order.payment, mp_client)
        notify_paid_without_stock(order, background_tasks)
    else:
        notify_purchase(order, background_tasks)


@router.post("/webhook")
async def receive_notification(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    mp_client: MercadoPagoClient = Depends(get_mp_client),
):
    """Aviso de Mercado Pago de que un pago cambió.

    No se le cree al aviso: se consulta el pago a Mercado Pago y se usa lo
    que responde. Mercado Pago reintenta mientras no reciba un 200, así que
    los avisos que no sirven (otro tipo, otro pedido) también responden 200.
    """
    try:
        body_data = await request.json()
    except ValueError:
        body_data = {}
    if not isinstance(body_data, dict):
        body_data = {}

    params = request.query_params
    tipo = params.get("type") or params.get("topic") or body_data.get("type")
    payment_id_value = params.get("data.id") or params.get("id") or (body_data.get("data") or {}).get("id")
    if tipo != "payment" or not payment_id_value:
        return {"ok": True}
    payment_id_value = str(payment_id_value)
    # Los ids de pago de Mercado Pago son números. Cualquier otra cosa se
    # descarta antes de armar la dirección de la consulta.
    if not payment_id_value.isdigit():
        return {"ok": True}

    if not valid_signature(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        payment_id_value,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Firma inválida.")

    # La consulta a Mercado Pago y la base son bloqueantes: van en un hilo
    # para no frenar el resto del backend (la función es async por el body).
    try:
        payment_data = await run_in_threadpool(mp_client.get_payment, payment_id_value)
    except MercadoPagoUnavailable as error:
        logger.warning("No se pudo consultar el pago %s: %s", payment_id_value, error)
        # Mercado Pago vuelve a mandar el aviso más tarde.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="No pudimos consultar el pago."
        ) from error

    if not payment_data.reference or not payment_data.reference.isdigit():
        return {"ok": True}

    def apply():
        payment, just_approved = crud_payment.apply_mp_status(
            db, int(payment_data.reference), payment_data.id, payment_data.state, payment_data.charged_amount
        )
        # El pedido se carga acá, en el hilo, para el mail.
        return payment.order if just_approved else None

    approved_order = await run_in_threadpool(apply)
    if approved_order is not None:
        # La devolución (si hace falta) llama a Mercado Pago: también en un hilo.
        await run_in_threadpool(_notify_approved_payment, db, approved_order, background_tasks, mp_client)
    return {"ok": True}


@router.post("/{order_id}/verificar", response_model=PaymentStatusOut)
def verify_payment(
    order_id: int,
    data: VerifyPaymentIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    mp_client: MercadoPagoClient = Depends(get_mp_client),
):
    """Confirma el pago al volver de Mercado Pago, sin esperar el aviso.

    Mercado Pago agrega `payment_id` a la dirección de vuelta. Igual que con
    el aviso, no se le cree: se consulta el pago y se usa lo que responde.
    El aviso queda de respaldo (por ejemplo, si el cliente cierra la página).
    """
    payment = crud_payment.get_payment_for_client(db, order_id, client.user_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    if not data.payment_id.isdigit():
        return PaymentStatusOut(estado=payment.status)

    try:
        payment_data = mp_client.get_payment(data.payment_id)
    except MercadoPagoUnavailable as error:
        logger.warning("No se pudo verificar el pago %s del pedido %s: %s", data.payment_id, order_id, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
        ) from error

    # Que nadie marque su pedido como pagado con el pago de otro pedido.
    if payment_data.reference != str(order_id):
        return PaymentStatusOut(estado=payment.status)

    payment, just_approved = crud_payment.apply_mp_status(db, order_id, payment_data.id, payment_data.state, payment_data.charged_amount)
    if just_approved:
        _notify_approved_payment(db, payment.order, background_tasks, mp_client)
    return PaymentStatusOut(estado=payment.status)


@router.post("/{order_id}", response_model=PaymentLinkOut)
def create_payment_link(
    order_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    mp_client: MercadoPagoClient = Depends(get_mp_client),
):
    """Link de Mercado Pago para pagar el pedido.

    Mientras el pago esté pendiente se devuelve el mismo link: con dos links
    vivos el cliente podría pagar dos veces, y el segundo cobro no quedaría
    registrado. Después de un rechazo (o en el primer intento) se crea uno nuevo.
    """
    client_id = client.user_id
    crud_order.cancel_expired_orders(db)
    payment = crud_payment.get_payment_for_client(db, order_id, client_id)
    if payment is None:
        # Pedidos de otro cliente, inexistentes o de antes de Mercado Pago.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    if payment.status == PaymentStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este pedido ya está pagado.")
    if payment.order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este pedido se canceló porque no se pagó a tiempo. Podés volver a comprar desde el catálogo.",
        )

    reutilizar = payment.status == PaymentStatus.PENDING and payment.mp_preference_id
    try:
        if reutilizar:
            return PaymentLinkOut(url=mp_client.get_preference(payment.mp_preference_id))
        preference_id, url = mp_client.create_preference(_build_preference(payment.order))
    except MercadoPagoUnavailable as error:
        # El cliente ve un mensaje genérico; el motivo real (falta el token,
        # token inválido, dato rechazado...) queda en el log del backend.
        logger.warning("No se pudo crear el link de pago del pedido %s: %s", order_id, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
        )

    crud_payment.set_preference(db, payment, preference_id)
    return PaymentLinkOut(url=url)
