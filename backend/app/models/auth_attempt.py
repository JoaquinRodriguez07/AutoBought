from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthAttempt(Base):
    """Estado de los intentos fallidos asociados a un correo.

    Se guarda una fila por correo para poder aplicar el límite tanto al
    inicio de sesión como a la validación de la contraseña actual al cambiarla.
    """

    __tablename__ = "auth_attempt"

    auth_attempt_id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
