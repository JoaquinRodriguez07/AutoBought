import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core.config import BACKEND_URL, FRONTEND_URL
from app.core.mercadopago import ClienteMercadoPago, MercadoPagoNoDisponible, firma_valida, get_cliente_mp
from app.core.notificaciones import notificar_compra
from app.crud import payment as crud_payment
from app.models.client import Client
from app.models.payment import PaymentStatus

router = APIRouter(prefix="/pagos", tags=["pagos"])
logger = logging.getLogger(__name__)

# Los precios de la tienda están en pesos uruguayos.
MONEDA = "UYU"


class LinkPagoOut(BaseModel):
    url: str


class VerificarPagoIn(BaseModel):
    payment_id: str


class EstadoPagoOut(BaseModel):
    estado: PaymentStatus


def _armar_preferencia(order) -> dict:
    """La preferencia de Mercado Pago: qué se cobra y adónde vuelve el cliente.
    El número de pedido va en `external_reference`, y vuelve en cada pago."""
    volver = f"{FRONTEND_URL}/pago?pedido={order.order_id}"
    preferencia = {
        "items": [
            {
                "id": str(item.part_id),
                "title": item.part.name,
                "quantity": item.quantity,
                "unit_price": item.frozen_price,
                "currency_id": MONEDA,
            }
            for item in order.items
        ],
        "external_reference": str(order.order_id),
        "back_urls": {"success": volver, "failure": volver, "pending": volver},
    }
    # Mercado Pago solo vuelve solo (sin que el cliente toque "Volver al
    # sitio") a direcciones https; en local el cliente vuelve con el botón.
    if volver.startswith("https://"):
        preferencia["auto_return"] = "approved"
    # Sin dirección pública (en local) Mercado Pago no tiene adónde avisar.
    if BACKEND_URL:
        preferencia["notification_url"] = f"{BACKEND_URL}/api/v1/pagos/webhook"
    return preferencia


@router.post("/webhook")
async def recibir_aviso(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    cliente_mp: ClienteMercadoPago = Depends(get_cliente_mp),
):
    """Aviso de Mercado Pago de que un pago cambió.

    No se le cree al aviso: se consulta el pago a Mercado Pago y se usa lo
    que responde. Mercado Pago reintenta mientras no reciba un 200, así que
    los avisos que no sirven (otro tipo, otro pedido) también responden 200.
    """
    try:
        cuerpo = await request.json()
    except ValueError:
        cuerpo = {}
    if not isinstance(cuerpo, dict):
        cuerpo = {}

    params = request.query_params
    tipo = params.get("type") or params.get("topic") or cuerpo.get("type")
    pago_id = params.get("data.id") or params.get("id") or (cuerpo.get("data") or {}).get("id")
    if tipo != "payment" or not pago_id:
        return {"ok": True}
    pago_id = str(pago_id)
    # Los ids de pago de Mercado Pago son números. Cualquier otra cosa se
    # descarta antes de armar la dirección de la consulta.
    if not pago_id.isdigit():
        return {"ok": True}

    if not firma_valida(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        pago_id,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Firma inválida.")

    # La consulta a Mercado Pago y la base son bloqueantes: van en un hilo
    # para no frenar el resto del backend (la función es async por el body).
    try:
        pago = await run_in_threadpool(cliente_mp.consultar_pago, pago_id)
    except MercadoPagoNoDisponible as error:
        logger.warning("No se pudo consultar el pago %s: %s", pago_id, error)
        # Mercado Pago vuelve a mandar el aviso más tarde.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="No pudimos consultar el pago."
        ) from error

    if not pago.referencia or not pago.referencia.isdigit():
        return {"ok": True}

    def aplicar():
        payment, recien_aprobado = crud_payment.apply_mp_status(db, int(pago.referencia), pago.id, pago.estado)
        # El pedido se carga acá, en el hilo, para el mail.
        return payment.order if recien_aprobado else None

    pedido_aprobado = await run_in_threadpool(aplicar)
    if pedido_aprobado is not None:
        notificar_compra(pedido_aprobado, background_tasks)
    return {"ok": True}


@router.post("/{order_id}/verificar", response_model=EstadoPagoOut)
def verificar_pago(
    order_id: int,
    datos: VerificarPagoIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    cliente_mp: ClienteMercadoPago = Depends(get_cliente_mp),
):
    """Confirma el pago al volver de Mercado Pago, sin esperar el aviso.

    Mercado Pago agrega `payment_id` a la dirección de vuelta. Igual que con
    el aviso, no se le cree: se consulta el pago y se usa lo que responde.
    El aviso queda de respaldo (por ejemplo, si el cliente cierra la página).
    """
    payment = crud_payment.get_payment_for_client(db, order_id, client.user_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    if not datos.payment_id.isdigit():
        return EstadoPagoOut(estado=payment.status)

    try:
        pago = cliente_mp.consultar_pago(datos.payment_id)
    except MercadoPagoNoDisponible as error:
        logger.warning("No se pudo verificar el pago %s del pedido %s: %s", datos.payment_id, order_id, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
        ) from error

    # Que nadie marque su pedido como pagado con el pago de otro pedido.
    if pago.referencia != str(order_id):
        return EstadoPagoOut(estado=payment.status)

    payment, recien_aprobado = crud_payment.apply_mp_status(db, order_id, pago.id, pago.estado)
    if recien_aprobado:
        notificar_compra(payment.order, background_tasks)
    return EstadoPagoOut(estado=payment.status)


@router.post("/{order_id}", response_model=LinkPagoOut)
def crear_link_pago(
    order_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    cliente_mp: ClienteMercadoPago = Depends(get_cliente_mp),
):
    """Link de Mercado Pago para pagar el pedido. Sirve también para
    reintentar después de un pago rechazado: cada vez es un link nuevo."""
    payment = crud_payment.get_payment_for_client(db, order_id, client.user_id)
    if payment is None:
        # Pedidos de otro cliente, inexistentes o de antes de Mercado Pago.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    if payment.status == PaymentStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este pedido ya está pagado.")

    try:
        preference_id, url = cliente_mp.crear_preferencia(_armar_preferencia(payment.order))
    except MercadoPagoNoDisponible as error:
        # El cliente ve un mensaje genérico; el motivo real (falta el token,
        # token inválido, dato rechazado...) queda en el log del backend.
        logger.warning("No se pudo crear el link de pago del pedido %s: %s", order_id, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
        )

    crud_payment.set_preference(db, payment, preference_id)
    return LinkPagoOut(url=url)
