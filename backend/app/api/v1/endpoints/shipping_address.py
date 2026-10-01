from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import shipping_address as crud_address
from app.models.client import Client
from app.schemas.shipping_address import ShippingAddressCreate, ShippingAddressOut

router = APIRouter(prefix="/addresses", tags=["addresses"])


@router.get("", response_model=list[ShippingAddressOut])
def list_addresses(db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    return crud_address.list_addresses(db, client.user_id)


@router.post("", response_model=ShippingAddressOut, status_code=status.HTTP_201_CREATED)
def create_address(body: ShippingAddressCreate, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    return crud_address.create_address(db, client.user_id, body)


@router.delete("/{shipping_address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(shipping_address_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    eliminada = crud_address.delete_address(db, client.user_id, shipping_address_id)
    if not eliminada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dirección no encontrada.")