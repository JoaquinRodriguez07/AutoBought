from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.payment_method import PaymentMethod
from app.schemas.payment_method import PaymentMethodCreate

MAX_METODOS_POR_CLIENTE = 10


class PaymentMethodConflict(ValueError):
    """La operación choca con lo que el cliente ya tiene guardado."""


def list_payment_methods(db: Session, client_id: int) -> list[PaymentMethod]:
    query = (
        select(PaymentMethod)
        .where(PaymentMethod.client_id == client_id)
        .order_by(PaymentMethod.payment_method_id)
    )
    return list(db.scalars(query).all())


def get_payment_method(db: Session, client_id: int, payment_method_id: int) -> PaymentMethod | None:
    query = select(PaymentMethod).where(
        PaymentMethod.client_id == client_id,
        PaymentMethod.payment_method_id == payment_method_id,
    )
    return db.scalars(query).first()


def _unset_primary(db: Session, client_id: int) -> None:
    db.execute(
        update(PaymentMethod)
        .where(PaymentMethod.client_id == client_id)
        .values(is_primary=False)
    )


def create_payment_method(db: Session, client_id: int, data: PaymentMethodCreate) -> PaymentMethod:
    existing = list_payment_methods(db, client_id)
    has_methods = bool(existing)

    if len(existing) >= MAX_METODOS_POR_CLIENTE:
        raise PaymentMethodConflict(
            f"Podés guardar hasta {MAX_METODOS_POR_CLIENTE} tarjetas. Eliminá alguna para agregar otra."
        )

    fields = data.model_dump(mode="json")
    if any(
        (m.card_type, m.last_four, m.expiry) == (fields["card_type"], fields["last_four"], fields["expiry"])
        for m in existing
    ):
        raise PaymentMethodConflict("Ya tenés guardada esta tarjeta.")

    # El primer método del cliente queda como principal automáticamente.
    fields["is_primary"] = fields["is_primary"] or not has_methods

    if fields["is_primary"]:
        _unset_primary(db, client_id)

    method = PaymentMethod(
        client_id=client_id,
        method=f"{fields['card_type']} •••• {fields['last_four']}",
        **fields,
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


def set_primary(db: Session, client_id: int, payment_method_id: int) -> PaymentMethod | None:
    method = get_payment_method(db, client_id, payment_method_id)
    if method is None:
        return None

    if method.is_expired:
        raise PaymentMethodConflict("No podés marcar como principal una tarjeta vencida.")

    _unset_primary(db, client_id)
    method.is_primary = True
    db.commit()
    db.refresh(method)
    return method


def delete_payment_method(db: Session, client_id: int, payment_method_id: int) -> bool:
    method = get_payment_method(db, client_id, payment_method_id)
    if method is None:
        return False

    was_primary = method.is_primary
    db.delete(method)
    db.flush()

    # Si se borra la principal, pasa a serlo la más antigua que no esté
    # vencida (o la más antigua, si están todas vencidas).
    if was_primary:
        remaining = list_payment_methods(db, client_id)
        vigentes = [m for m in remaining if not m.is_expired]
        nueva_principal = (vigentes or remaining or [None])[0]
        if nueva_principal is not None:
            nueva_principal.is_primary = True

    db.commit()
    return True
