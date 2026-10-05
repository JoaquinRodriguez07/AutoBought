from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import payment_method as crud_payment
from app.models.client import Client
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodOut

router = APIRouter(prefix="/payment-methods", tags=["payment-methods"])


@router.get("", response_model=list[PaymentMethodOut])
def list_payment_methods(db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    return crud_payment.list_payment_methods(db, client.user_id)


@router.post("", response_model=PaymentMethodOut, status_code=status.HTTP_201_CREATED)
def create_payment_method(body: PaymentMethodCreate, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    return crud_payment.create_payment_method(db, client.user_id, body)


@router.patch("/{payment_method_id}/primary", response_model=PaymentMethodOut)
def set_primary_payment_method(payment_method_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    method = crud_payment.set_primary(db, client.user_id, payment_method_id)
    if method is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Método de pago no encontrado.")
    return method


@router.delete("/{payment_method_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment_method(payment_method_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    eliminado = crud_payment.delete_payment_method(db, client.user_id, payment_method_id)
    if not eliminado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Método de pago no encontrado.")
