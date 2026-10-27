from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_attempt import AuthAttempt

MAX_FAILED_ATTEMPTS = 5
ATTEMPT_WINDOW = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """SQLite puede devolver DateTime(timezone=True) sin tzinfo."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _email(email: str) -> str:
    return email.strip().lower()


def is_blocked(db: Session, email: str, now: datetime | None = None) -> bool:
    now = now or _now()
    row = db.scalars(
        select(AuthAttempt).where(AuthAttempt.email == _email(email))
    ).first()
    blocked_until = _aware(row.blocked_until) if row else None
    if blocked_until is None:
        return False
    if blocked_until <= now:
        row.blocked_until = None
        row.failed_attempts = 0
        row.first_failed_at = None
        db.commit()
        return False
    return True


def register_failure(db: Session, email: str, now: datetime | None = None) -> bool:
    """Registra un fallo y devuelve si el correo quedó bloqueado."""
    now = now or _now()
    email = _email(email)
    row = db.scalars(
        select(AuthAttempt).where(AuthAttempt.email == email)
    ).first()

    if row is None:
        row = AuthAttempt(
            email=email,
            failed_attempts=1,
            first_failed_at=now,
        )
        db.add(row)
    else:
        first_failed_at = _aware(row.first_failed_at)
        blocked_until = _aware(row.blocked_until)

        # Si terminó un bloqueo anterior, se empieza una ventana nueva.
        if blocked_until is not None and blocked_until <= now:
            row.failed_attempts = 1
            row.first_failed_at = now
            row.blocked_until = None
        # Si la ventana de 15 minutos ya venció, los fallos anteriores dejan
        # de contar.
        elif first_failed_at is None or now - first_failed_at >= ATTEMPT_WINDOW:
            row.failed_attempts = 1
            row.first_failed_at = now
            row.blocked_until = None
        else:
            row.failed_attempts += 1

    if row.failed_attempts >= MAX_FAILED_ATTEMPTS:
        row.blocked_until = now + ATTEMPT_WINDOW

    db.commit()
    return row.blocked_until is not None and _aware(row.blocked_until) > now


def clear_failures(db: Session, email: str) -> None:
    email = _email(email)
    row = db.scalars(
        select(AuthAttempt).where(AuthAttempt.email == email)
    ).first()
    if row is not None:
        db.delete(row)
        db.commit()
