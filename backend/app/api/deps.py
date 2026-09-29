import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal
from app.models.client import Client


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


def get_current_client(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> Client:
    """Autentica al cliente dueño del token en Authorization: Bearer.

    401 si falta el token, es inválido, venció o el usuario ya no existe.
    403 si el token es válido pero no es de un cliente (ej: empleado).
    """
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
    )

    if credentials is None:
        raise credenciales_invalidas

    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[JWT_ALGORITHM]
        )
    except jwt.PyJWTError:
        raise credenciales_invalidas

    user_id = payload.get("sub")
    if user_id is None:
        raise credenciales_invalidas

    if payload.get("user_type") != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción requiere una cuenta de cliente.",
        )

    try:
        client_id = int(user_id)
    except (TypeError, ValueError):
        raise credenciales_invalidas

    client = db.get(Client, client_id)
    if client is None:
        raise credenciales_invalidas

    return client
