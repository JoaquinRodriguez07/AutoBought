from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import cart as crud_cart
from app.crud import part as crud_part
from app.models.client import Client
from app.schemas.cart import CartDetailOut, CartItemCreate, CartItemUpdate, build_cart_detail_out

router = APIRouter(prefix="/cart", tags=["cart"])


def _cart_detail(db: Session, client_id: int) -> CartDetailOut:
    cart = crud_cart.get_or_create_cart(db, client_id)
    return build_cart_detail_out(cart)


@router.get("", response_model=CartDetailOut)
def get_cart(
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    return _cart_detail(db, client.user_id)


@router.post("/items", response_model=CartDetailOut)
def add_item(
    body: CartItemCreate,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    part = crud_part.get_part(db, body.part_id)
    if part is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repuesto no encontrado.",
        )

    item_actual = crud_cart.get_cart_item(db, client.user_id, body.part_id)
    cantidad_previa = item_actual.amount if item_actual else 0
    cantidad_final = cantidad_previa + body.amount

    if cantidad_final > part.stock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No hay stock suficiente. Disponible: {part.stock} unidades.",
        )

    crud_cart.add_item(db, client.user_id, body.part_id, body.amount)
    return _cart_detail(db, client.user_id)


@router.patch("/items/{part_id}", response_model=CartDetailOut)
def update_item(
    part_id: int,
    body: CartItemUpdate,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repuesto no encontrado.",
        )

    if body.amount > part.stock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No hay stock suficiente. Disponible: {part.stock} unidades.",
        )

    item = crud_cart.set_item_amount(db, client.user_id, part_id, body.amount)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El repuesto no está en el carrito.",
        )

    return _cart_detail(db, client.user_id)


@router.delete("/items/{part_id}", response_model=CartDetailOut)
def remove_item(
    part_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    eliminado = crud_cart.remove_item(db, client.user_id, part_id)
    if not eliminado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El repuesto no está en el carrito.",
        )

    return _cart_detail(db, client.user_id)


@router.delete("", response_model=CartDetailOut)
def clear_cart(
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    crud_cart.get_or_create_cart(db, client.user_id)
    crud_cart.clear_cart(db, client.user_id)
    return _cart_detail(db, client.user_id)
