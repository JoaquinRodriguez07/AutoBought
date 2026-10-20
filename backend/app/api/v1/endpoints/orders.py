import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core.notificaciones import notificar_compra
from app.crud import order as crud_order
from app.crud import part as crud_part
from app.models.client import Client
from app.schemas.order import (
    OrderConfirm,
    OrderDetailOut,
    OrderListOut,
    build_order_detail_out,
)

router = APIRouter(prefix="/orders", tags=["orders"])

# Errores de place_order sobre la dirección y el método de pago. Una id
# inexistente o de otro cliente da el mismo 422, sin revelar cuál de las dos.
_ERRORES_DATOS_COMPRA = {
    "Client has no shipping address": (
        status.HTTP_400_BAD_REQUEST,
        "Agregá una dirección de envío para confirmar la compra.",
    ),
    "Client has no payment method": (
        status.HTTP_400_BAD_REQUEST,
        "Agregá un método de pago para confirmar la compra.",
    ),
    "Shipping address not found": (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "La dirección de envío elegida no es válida.",
    ),
    "Payment method not found": (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "El método de pago elegido no es válido.",
    ),
    "Payment method expired": (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "La tarjeta elegida está vencida. Elegí otra o agregá una nueva.",
    ),
}


def _detalle_sin_stock(db: Session, mensaje: str) -> str:
    """Arma el detalle del 409 a partir del ValueError de place_order
    ("Not enough stock for part {id}: requested X, available Y"),
    usando el nombre del repuesto si todavía existe.
    """
    match = re.search(r"part (\d+): requested (\d+), available (\d+)", mensaje)
    if match is None:
        return "No hay stock suficiente para completar la compra."

    part_id, pedido, disponible = (int(valor) for valor in match.groups())
    part = crud_part.get_part(db, part_id)
    repuesto = f"'{part.name}'" if part is not None else f"el repuesto {part_id}"
    return (
        f"No hay stock suficiente de {repuesto}: "
        f"pediste {pedido}, hay {disponible}."
    )


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def confirm_order(
    background_tasks: BackgroundTasks,
    body: OrderConfirm | None = None,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    if not client.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verificá tu correo para confirmar la compra. Te mandamos un enlace al registrarte.",
        )

    client_id = client.user_id
    body = body or OrderConfirm()

    # place_order abre su propia transacción con `db.begin()`, y la
    # autenticación ya dejó una abierta al leer el cliente. Solo hubo
    # lecturas, así que el rollback no descarta nada.
    db.rollback()

    try:
        order = crud_order.place_order(
            db,
            client_id,
            shipping_address_id=body.shipping_address_id,
            payment_method_id=body.payment_method_id,
        )
    except ValueError as error:
        mensaje = str(error)

        if mensaje.startswith("Not enough stock"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_detalle_sin_stock(db, mensaje),
            )

        if mensaje.startswith("Parts not found"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Algún repuesto del carrito ya no está disponible.",
            )

        if mensaje in _ERRORES_DATOS_COMPRA:
            codigo, detalle = _ERRORES_DATOS_COMPRA[mensaje]
            raise HTTPException(status_code=codigo, detail=detalle)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu carrito está vacío.",
        )

    notificar_compra(order, background_tasks)
    return build_order_detail_out(order)


@router.get("", response_model=OrderListOut)
def list_orders(
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    orders = crud_order.list_order_by_client(db, client.user_id)
    return {
        "orders": [build_order_detail_out(order) for order in orders],
    }


@router.get("/{order_id}", response_model=OrderDetailOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    order = crud_order.get_order_for_client(db, order_id, client.user_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )

    return build_order_detail_out(order)
