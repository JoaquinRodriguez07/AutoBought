import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import order as crud_order
from app.crud import part as crud_part
from app.models.client import Client
from app.schemas.order import OrderDetailOut, build_order_detail_out

router = APIRouter(prefix="/orders", tags=["orders"])


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
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    client_id = client.user_id

    # place_order abre su propia transacción con `db.begin()`, y la
    # autenticación ya dejó una abierta al leer el cliente. Solo hubo
    # lecturas, así que el rollback no descarta nada.
    db.rollback()

    try:
        order = crud_order.place_order(db, client_id)
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

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu carrito está vacío.",
        )

    return build_order_detail_out(order)
