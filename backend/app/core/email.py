import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import (
    EMAIL_FROM,
    FRONTEND_URL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
)

logger = logging.getLogger(__name__)

_PLANTILLAS = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "templates" / "emails"),
    autoescape=select_autoescape(["html"]),
)


def armar_mensaje(
    destino: str, asunto: str, plantilla: str, datos: dict, enlace_baja: str | None = None
) -> EmailMessage:
    """Arma el mail con la plantilla HTML y una versión en texto plano para
    los clientes de correo que no muestran HTML.

    Los mails comerciales pasan `enlace_baja`: va al pie del mail y en el
    encabezado List-Unsubscribe, con el que Gmail muestra su propio botón
    de «Anular suscripción»."""
    contexto = {"frontend_url": FRONTEND_URL, "enlace_baja": enlace_baja, **datos}

    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = EMAIL_FROM
    mensaje["To"] = destino
    if enlace_baja:
        mensaje["List-Unsubscribe"] = f"<{enlace_baja}>"
    mensaje.set_content(_PLANTILLAS.get_template(f"{plantilla}.txt").render(contexto))
    mensaje.add_alternative(
        _PLANTILLAS.get_template(f"{plantilla}.html").render(contexto), subtype="html"
    )
    return mensaje


def _enviar_smtp(mensaje: EmailMessage) -> None:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        # Mailpit no usa usuario ni cifrado; Gmail pide los dos.
        if SMTP_USER:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(mensaje)


def enviar_mail(
    destino: str, asunto: str, plantilla: str, datos: dict, enlace_baja: str | None = None
) -> bool:
    """Se llama con BackgroundTasks, después de responder: si el envío
    falla, la acción del usuario ya se hizo, así que solo se registra.
    Devuelve si salió, para las tareas diarias."""
    mensaje = armar_mensaje(destino, asunto, plantilla, datos, enlace_baja)
    try:
        _enviar_smtp(mensaje)
    except (OSError, smtplib.SMTPException):
        logger.exception("No se pudo enviar el mail '%s' a %s", asunto, destino)
        return False
    return True
