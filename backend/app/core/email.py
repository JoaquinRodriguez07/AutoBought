"""Arma y manda los mails con las plantillas de app/templates/emails."""

import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import (
    EMAIL_FROM,
    FRONTEND_URL,
    SEND_MAILS_IN_BACKGROUND,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
)

logger = logging.getLogger(__name__)

_TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "templates" / "emails"),
    autoescape=select_autoescape(["html"]),
)


def build_message(
    recipient: str, subject: str, template: str, data: dict, unsubscribe_link: str | None = None
) -> EmailMessage:
    """Arma el mail con la plantilla HTML y una versión en texto plano para
    los clientes de correo que no muestran HTML.

    Los mails comerciales pasan `unsubscribe_link`: va al pie del mail y en el
    encabezado List-Unsubscribe, con el que Gmail muestra su propio botón
    de «Anular suscripción»."""
    contexto = {"frontend_url": FRONTEND_URL, "enlace_baja": unsubscribe_link, **data}

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = recipient
    if unsubscribe_link:
        msg["List-Unsubscribe"] = f"<{unsubscribe_link}>"
    msg.set_content(_TEMPLATES.get_template(f"{template}.txt").render(contexto))
    msg.add_alternative(
        _TEMPLATES.get_template(f"{template}.html").render(contexto), subtype="html"
    )
    return msg


def _send_smtp(msg: EmailMessage) -> None:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        # Mailpit no usa usuario ni cifrado; Gmail pide los dos.
        if SMTP_USER:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)


def send_mail(
    recipient: str, subject: str, template: str, data: dict, unsubscribe_link: str | None = None
) -> bool:
    """Se llama con schedule_mail: si el envío falla, la acción del
    usuario ya se hizo, así que solo se registra.
    Devuelve si salió, para las tareas diarias."""
    msg = build_message(recipient, subject, template, data, unsubscribe_link)
    if not SMTP_HOST:
        logger.error("No se mandó el mail '%s': falta SMTP_HOST.", subject)
        return False
    try:
        _send_smtp(msg)
    except (OSError, smtplib.SMTPException):
        logger.exception("No se pudo enviar el mail '%s' a %s", subject, _mask(recipient))
        return False
    # Queda en el log que salió, para distinguir "no se mandó" de "no llegó".
    logger.warning("Mail enviado: '%s' a %s por %s", subject, _mask(recipient), SMTP_HOST)
    return True


def _mask(email_address: str) -> str:
    """"ana.perez@gmail.com" -> "a***@gmail.com": el log no guarda el correo entero."""
    user_obj, _, dominio = email_address.partition("@")
    return f"{user_obj[:1]}***@{dominio}"


def schedule_mail(background_tasks, *args, **kwargs) -> None:
    """Manda el mail en segundo plano (después de responder) o ya mismo,
    según SEND_MAILS_IN_BACKGROUND (ver config.py). Sin background_tasks,
    sale ya mismo."""
    if background_tasks is None or not SEND_MAILS_IN_BACKGROUND:
        send_mail(*args, **kwargs)
    else:
        background_tasks.add_task(send_mail, *args, **kwargs)
