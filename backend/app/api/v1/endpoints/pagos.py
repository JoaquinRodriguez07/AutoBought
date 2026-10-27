from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
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

# Los precios de la tienda están en pesos uruguayos.
MONEDA = "UYU"


class LinkPagoOut(BaseModel):
    url: str


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

    if not firma_valida(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        pago_id,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Firma inválida.")

    try:
        pago = cliente_mp.consultar_pago(pago_id)
    except MercadoPagoNoDisponible:
        # Mercado Pago vuelve a mandar el aviso más tarde.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No pudimos consultar el pago.")

    if not pago.referencia or not pago.referencia.isdigit():
        return {"ok": True}

    payment, recien_aprobado = crud_payment.apply_mp_status(db, int(pago.referencia), pago.id, pago.estado)
    if recien_aprobado:
        notificar_compra(payment.order, background_tasks)
    return {"ok": True}


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
    except MercadoPagoNoDisponible:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
        )

    crud_payment.set_preference(db, payment, preference_id)
    return LinkPagoOut(url=url)
