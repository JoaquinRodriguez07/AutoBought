from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import cart as crud_cart
from app.schemas.cart import CartDetailOut, build_cart_detail_out

router = APIRouter(prefix = "/cart", tags = ["cart"])

@router.get("/{client_id}", response_model = CartDetailOut)
def get_cart(client_id: int, db: Session = Depends(get_db)):
    cart = crud_cart.get_cart(db, client_id)
    if cart is None:
        raise HTTPException(status_code = 404, detail = "Cart not found")
    return build_cart_detail_out(cart)