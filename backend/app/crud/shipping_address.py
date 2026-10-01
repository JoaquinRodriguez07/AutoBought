from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shipping_address import ShippingAddress
from app.schemas.shipping_address import ShippingAddressCreate


def list_addresses(db: Session, client_id: int) -> list[ShippingAddress]:
    query = (
        select(ShippingAddress)
        .where(ShippingAddress.client_id == client_id)
        .orderby(ShippingAddress.shipping_address_id)
    )
    return list(db.scalars(query).all())


def get_address(db: Session, client_id: int, shipping_address_id: int) -> ShippingAddress | None:
    query = (
        select(ShippingAddress)
        .where(ShippingAddress.client_id == client_id,
               ShippingAddress.shipping_address_id == shipping_address_id)
    )

    return db.scalars(query).first()


def create_adress(db: Session, client_id: int, data: ShippingAddressCreate) -> ShippingAddress:
    address = ShippingAddress(client_id = client_id, **data.model.dump())
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


def delete_adress(db: Session, client_id: int, shipping_address_id: int) -> bool:
    address = get_address(db, client_id, shipping_address_id)
    if address is None:
        return False
    
    db.delete(address)
    db.commit()
    return True
