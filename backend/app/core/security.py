"""Contraseñas (bcrypt) y tokens JWT: de sesión y de los enlaces que van por mail."""

import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, SECRET_KEY


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)
    return hashed_bytes.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    password_bytes = password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


# Tokens de los enlaces que van por mail (verificar el correo, recuperar la
# contraseña). Se firman con una clave derivada del propósito: así no sirven
# como token de sesión ni uno sirve en lugar del otro.
VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"
UNSUBSCRIBE_PURPOSE = "unsubscribe"


def _key_for(purpose: str) -> str:
    return f"{SECRET_KEY}:{purpose}"


def password_fingerprint(password_hash: str) -> str:
    """Resumen corto del hash de la contraseña. Va dentro del token de
    recuperación: cuando la contraseña cambia, la huella deja de coincidir
    y el enlace ya no sirve, así que se puede usar una sola vez."""
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_purpose_token(
    subject: str, purpose: str, minutes_count: int, extra_claims: dict | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes_count)
    payload = {"sub": subject, "exp": expire, "purpose": purpose}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _key_for(purpose), algorithm=JWT_ALGORITHM)


def decode_purpose_token(token: str, purpose: str) -> dict | None:
    """Devuelve los datos del token, o None si es inválido, venció o es de
    otro propósito."""
    try:
        payload = jwt.decode(token, _key_for(purpose), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != purpose:
        return None
    return payload
