import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.user import User


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


def update_client(db: Session, client: Client, *, name: str, phone: str | None) -> Client:
    client.name = name
    client.phone = phone
    db.commit()
    db.refresh(client)
    return client


def update_password(db: Session, client: Client, password_hash: str) -> None:
    client.password = password_hash
    db.commit()
