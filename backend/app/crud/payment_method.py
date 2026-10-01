from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.payment_method import PaymentMethod
from app.schemas.payment_method import PaymentMethodCreate


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
    has_methods = db.scalars(
        select(PaymentMethod.payment_method_id)
        .where(PaymentMethod.client_id == client_id)
        .limit(1)
    ).first() is not None

    fields = data.model_dump(mode="json")
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

    # Si se borra la principal, el método más antiguo pasa a serlo.
    if was_primary:
        remaining = db.scalars(
            select(PaymentMethod)
            .where(PaymentMethod.client_id == client_id)
            .order_by(PaymentMethod.payment_method_id)
            .limit(1)
        ).first()
        if remaining is not None:
            remaining.is_primary = True

    db.commit()
    return True
