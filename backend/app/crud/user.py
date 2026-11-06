import re
import secrets

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.client import Client
from app.models.employee import Employee
from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus
from app.models.shipping_address import ShippingAddress
from app.models.stock_alert import StockAlert
from app.models.user import User


class IncorrectAccountPassword(Exception):
    pass


class OngoingOrders(Exception):
    pass


def get_user_by_email(db: Session, email: str) -> User | None:
    # Comparación sin distinguir mayúsculas: el registro guarda el correo
    # en minúsculas y el login tiene que encontrarlo igual si el usuario
    # lo escribe como "Ana@Example.com".
    query = select(User).where(func.lower(User.email) == email.strip().lower())
    return db.scalars(query).first()


def _username_disponible(db: Session, email: str) -> str:
    """`user.username` es obligatorio y único, pero el formulario no lo
    pide: se deriva de la parte local del correo, con sufijo aleatorio si
    ya está tomado."""
    base = re.sub(r"[^a-z0-9._-]", "", email.split("@")[0].lower())[:50] or "cliente"
    candidato = base
    while db.scalars(select(User).where(User.username == candidato)).first():
        candidato = f"{base}_{secrets.token_hex(3)}"
    return candidato


def create_client(
    db: Session,
    *,
    name: str,
    email: str,
    password_hash: str,
    phone: str | None = None,
) -> Client:
    """Inserta user + client. Puede lanzar IntegrityError (UNIQUE) si dos
    registros con el mismo correo compiten; el caller hace el rollback."""
    email = email.strip().lower()
    client = Client(
        username=_username_disponible(db, email),
        password=password_hash,
        name=name,
        email=email,
        phone=phone,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def create_employee(
    db: Session,
    *,
    name: str,
    email: str,
    password_hash: str,
) -> Employee:
    """Inserta user + employee (vendedor). Puede lanzar IntegrityError
    (UNIQUE) si dos altas con el mismo correo compiten; el caller hace el
    rollback."""
    email = email.strip().lower()
    employee = Employee(
        username=_username_disponible(db, email),
        password=password_hash,
        name=name,
        email=email,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def update_client(db: Session, client: Client, *, name: str, phone: str | None) -> Client:
    client.name = name
    client.phone = phone
    db.commit()
    db.refresh(client)
    return client


def update_password(db: Session, user: User, password_hash: str) -> None:
    user.password = password_hash
    # Misma transacción (incremento en SQL, sin carrera): invalida los tokens
    # emitidos con la contraseña anterior.
    user.session_version = User.session_version + 1
    db.commit()


def mark_email_verified(db: Session, user: User) -> None:
    user.email_verified = True
    db.commit()


def set_marketing_emails(db: Session, client: Client, value: bool) -> Client:
    client.marketing_emails = value
    db.commit()
    db.refresh(client)
    return client


def delete_client_account(db: Session, client_id: int, password: str) -> None:
    """Anonymize a client while retaining closed orders for sales analytics."""
    with db.begin():
        client = db.scalar(
            select(Client).where(Client.user_id == client_id).with_for_update()
        )
        if client is None:
            return
        if not verify_password(password, client.password):
            raise IncorrectAccountPassword

        ongoing_order = db.scalar(
            select(Order.order_id)
            .join(Payment, Payment.order_id == Order.order_id)
            .where(
                Order.client_id == client_id,
                Order.status.notin_([OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
                Payment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED]),
            )
            .limit(1)
        )
        if ongoing_order is not None:
            raise OngoingOrders

        anonymous_name = f"Cliente eliminado {client_id}-{secrets.token_hex(6)}"
        client.name = anonymous_name
        client.email = f"eliminado-{client_id}@autobought.invalid"
        client.phone = None
        client.email_verified = False
        client.marketing_emails = False
        client.session_version += 1

        db.execute(
            update(Order)
            .where(Order.client_id == client_id)
            .values(
                shipping_address_id=None,
                ship_personal_name=anonymous_name,
                ship_street="Eliminado",
                ship_number="0",
                ship_apartment=None,
                ship_city="Eliminado",
                ship_department="Eliminado",
                ship_postal_code=None,
            )
        )
        db.execute(delete(StockAlert).where(StockAlert.client_id == client_id))
        db.execute(delete(Favorite).where(Favorite.client_id == client_id))
        db.execute(delete(CartItem).where(CartItem.cart_id == client_id))
        db.execute(delete(Cart).where(Cart.client_id == client_id))
        db.execute(
            delete(ShippingAddress).where(ShippingAddress.client_id == client_id)
        )
