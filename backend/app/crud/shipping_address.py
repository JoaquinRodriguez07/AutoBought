from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.validators import normalizar
from app.models.shipping_address import ShippingAddress
from app.schemas.shipping_address import ShippingAddressCreate

MAX_DIRECCIONES_POR_CLIENTE = 10


class ShippingAddressConflict(ValueError):
    """La operación choca con lo que el cliente ya tiene guardado."""


def _misma_direccion(address: ShippingAddress, fields: dict) -> bool:
    """Compara sin tildes ni mayúsculas: "Av. Italia" == "av. italia"."""
    claves = ("street", "number", "apartment", "city", "department")
    return all(
        normalizar(getattr(address, clave) or "") == normalizar(fields[clave] or "")
        for clave in claves
    )


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
    existing = list_addresses(db, client_id)
    has_addresses = bool(existing)

    if len(existing) >= MAX_DIRECCIONES_POR_CLIENTE:
        raise ShippingAddressConflict(
            f"Podés guardar hasta {MAX_DIRECCIONES_POR_CLIENTE} direcciones. Eliminá alguna para agregar otra."
        )

    fields = data.model_dump(mode="json")
    if any(_misma_direccion(address, fields) for address in existing):
        raise ShippingAddressConflict("Ya tenés guardada esta dirección.")

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
