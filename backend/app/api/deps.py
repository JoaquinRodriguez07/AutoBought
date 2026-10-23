import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal
from app.models.client import Client
from app.models.employee import Employee
from app.models.user import User


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# `auto_error=False` para poder devolver nuestro propio 401 (con mensaje
# en español) en vez del 403 genérico que tira FastAPI cuando falta el
# header Authorization.
_bearer_scheme = HTTPBearer(auto_error=False)


def _credenciales_invalidas() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
    )


def _decodificar_token(
    credentials: HTTPAuthorizationCredentials | None,
) -> tuple[int, str | None]:
    """Valida el token y devuelve (id de usuario, user_type del token).

    401 si falta, es inválido, venció o no trae un id de usuario válido.
    No toca la base: cada dependencia busca al usuario que le corresponde.
    """
    if credentials is None:
        raise _credenciales_invalidas()

    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[JWT_ALGORITHM]
        )
    except jwt.PyJWTError:
        raise _credenciales_invalidas()

    user_id = payload.get("sub")
    if user_id is None:
        raise _credenciales_invalidas()

    try:
        return int(user_id), payload.get("user_type")
    except (TypeError, ValueError):
        raise _credenciales_invalidas()


def get_current_client(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> Client:
    """Autentica al cliente dueño del token en Authorization: Bearer.

    401 si falta el token, es inválido, venció o el usuario ya no existe.
    403 si el token es válido pero no es de un cliente (ej: empleado).
    """
    client_id, user_type = _decodificar_token(credentials)

    if user_type != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción requiere una cuenta de cliente.",
        )

    client = db.get(Client, client_id)
    if client is None:
        raise _credenciales_invalidas()

    return client


def get_current_employee(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> Employee:
    """Autentica al empleado (vendedor) dueño del token en Authorization: Bearer.

    401 si falta el token, es inválido, venció o el usuario ya no existe.
    403 si el token es válido pero no es de un empleado (ej: cliente).
    """
    employee_id, user_type = _decodificar_token(credentials)

    if user_type != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción requiere una cuenta de vendedor.",
        )

    employee = db.get(Employee, employee_id)
    if employee is None:
        raise _credenciales_invalidas()

    return employee


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Autentica al usuario dueño del token, sea cliente o empleado.

    401 si falta el token, es inválido, venció o el usuario ya no existe.
    Para endpoints que sirven a cualquier rol (ej: renovar la sesión); los
    que son de un solo rol usan get_current_client / get_current_employee.
    """
    user_id, _ = _decodificar_token(credentials)

    user = db.get(User, user_id)
    if user is None:
        raise _credenciales_invalidas()

    return user
