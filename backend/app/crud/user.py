import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.employee import Employee
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


def create_employee(
    db: Session,
    *,
    name: str,
    email: str,
    password_hash: str,
    is_admin: bool = False,
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
        is_admin=is_admin,
        # El enlace para elegir la contraseña llega a su correo.
        email_verified=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def list_employees(db: Session) -> list[Employee]:
    """Los vendedores que siguen en el equipo, por nombre."""
    return list(db.scalars(select(Employee).where(Employee.active.is_(True)).order_by(Employee.name, Employee.user_id)))


def deactivate_employee(db: Session, employee: Employee) -> None:
    """Lo da de baja y cierra sus sesiones (los tokens ya emitidos dejan de
    valer, igual que al cambiar la contraseña)."""
    employee.active = False
    employee.session_version = Employee.session_version + 1
    db.commit()


def reactivate_employee(db: Session, employee: Employee, *, name: str, password_hash: str) -> Employee:
    """Vuelve a sumar a un vendedor dado de baja, con una contraseña nueva
    (la elige con el enlace del mail)."""
    employee.active = True
    employee.name = name
    employee.password = password_hash
    employee.session_version = Employee.session_version + 1
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
