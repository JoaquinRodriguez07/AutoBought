from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.shipping_address import ShippingAddress
from app.schemas.shipping_address import ShippingAddressCreate


def list_addresses(db: Session, client_id: int) -> list[ShippingAddress]:
    query = (
        select(ShippingAddress)
        .where(ShippingAddress.client_id == client_id)
        .order_by(ShippingAddress.shipping_address_id)
    )
    return list(db.scalars(query).all())


def get_address(db: Session, client_id: int, shipping_address_id: int) -> ShippingAddress | None:
    query = (
        select(ShippingAddress)
        .where(ShippingAddress.client_id == client_id,
               ShippingAddress.shipping_address_id == shipping_address_id)
    )

    return db.scalars(query).first()


def _unset_primary(db: Session, client_id: int) -> None:
    db.execute(
        update(ShippingAddress)
        .where(ShippingAddress.client_id == client_id)
        .values(is_primary=False)
    )


def create_address(db: Session, client_id: int, data: ShippingAddressCreate) -> ShippingAddress:
    has_addresses = db.scalars(
        select(ShippingAddress.shipping_address_id)
        .where(ShippingAddress.client_id == client_id)
        .limit(1)
    ).first() is not None

    fields = data.model_dump(mode="json")
    # La primera dirección del cliente queda como principal automáticamente.
    fields["is_primary"] = fields["is_primary"] or not has_addresses

    if fields["is_primary"]:
        _unset_primary(db, client_id)

    address = ShippingAddress(client_id=client_id, **fields)
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


def set_primary(db: Session, client_id: int, shipping_address_id: int) -> ShippingAddress | None:
    address = get_address(db, client_id, shipping_address_id)
    if address is None:
        return None

    _unset_primary(db, client_id)
    address.is_primary = True
    db.commit()
    db.refresh(address)
    return address


def delete_address(db: Session, client_id: int, shipping_address_id: int) -> bool:
    address = get_address(db, client_id, shipping_address_id)
    if address is None:
        return False

    was_primary = address.is_primary
    db.delete(address)
    db.flush()

    # Si se borra la principal, la dirección más antigua pasa a serlo.
    if was_primary:
        remaining = db.scalars(
            select(ShippingAddress)
            .where(ShippingAddress.client_id == client_id)
            .order_by(ShippingAddress.shipping_address_id)
            .limit(1)
        ).first()
        if remaining is not None:
            remaining.is_primary = True

    db.commit()
    return True
