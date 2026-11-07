"""Tests de los mails de cuenta y del envío por SMTP."""

import re
import smtplib

from fastapi import BackgroundTasks
from sqlalchemy import select

from app.core import email as email_module
from app.core.security import (
    RESET_PASSWORD,
    VERIFY_EMAIL,
    create_purpose_token,
    password_fingerprint,
)
from app.models.client import Client

# Se guarda antes de que el fixture `mails` lo reemplace en cada test.
_ENVIAR_SMTP_REAL = email_module._send_smtp

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
PASSWORD = "/api/v1/auth/me/password"
VERIFY = "/api/v1/auth/verify-email"
RESEND = "/api/v1/auth/verify-email/resend"
FORGOT = "/api/v1/auth/password/forgot"
RESET = "/api/v1/auth/password/reset"

CORREO = "lucia@example.com"
PASSWORD_ACTUAL = "secreto123"
PASSWORD_NUEVA = "Nueva2026x"


def registrar(client):
    response = client.post(REGISTER, json={
        "name": "Lucía Gómez",
        "email": CORREO,
        "phone": "099 123 456",
        "password": PASSWORD_ACTUAL,
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def texto(msg):
    return msg.get_body(preferencelist=("plain",)).get_content()


def html(msg):
    return msg.get_body(preferencelist=("html",)).get_content()


def mail_token(msg):
    return re.search(r"token=([\w.\-]+)", texto(msg)).group(1)


def can_enter(client, password):
    response = client.post(LOGIN, json={"email": CORREO, "password": password})
    return response.status_code == 200


# =====================================================
# Mails: armado y envío
# =====================================================


def test_el_mail_tiene_version_html_y_texto_con_el_enlace():
    msg = email_module.build_message(
        "ana@example.com",
        "Asunto",
        "verificar_correo",
        {"nombre": "Ana", "enlace": "http://front/verificar-correo?token=abc"},
    )

    assert msg["To"] == "ana@example.com"
    assert msg["Subject"] == "Asunto"
    assert "Hola Ana" in texto(msg)
    assert "http://front/verificar-correo?token=abc" in texto(msg)
    assert "Verificá tu correo" in html(msg)  # título de la plantilla base
    assert 'href="http://front/verificar-correo?token=abc"' in html(msg)


def test_el_html_escapa_los_datos_del_usuario():
    msg = email_module.build_message(
        "ana@example.com", "Asunto", "verificar_correo", {"nombre": "<b>Ana</b>", "enlace": "x"}
    )

    assert "<b>Ana</b>" not in html(msg)
    assert "&lt;b&gt;Ana&lt;/b&gt;" in html(msg)


def test_si_el_envio_falla_no_corta_la_accion(monkeypatch):
    def falla(_message):
        raise smtplib.SMTPException("sin conexión")

    monkeypatch.setattr("app.core.email._send_smtp", falla)

    email_module.send_mail("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})


class SMTPFalso:
    def __init__(self, host, port, timeout):
        self.calls = [("conectar", host, port)]
        SMTPFalso.last = self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def starttls(self):
        self.calls.append(("starttls",))

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def send_message(self, msg):
        self.calls.append(("enviar", msg["To"]))


def test_con_usuario_smtp_cifra_e_inicia_sesion_como_pide_gmail(monkeypatch):
    monkeypatch.setattr("app.core.email.smtplib.SMTP", SMTPFalso)
    monkeypatch.setattr("app.core.email.SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr("app.core.email.SMTP_PORT", 587)
    monkeypatch.setattr("app.core.email.SMTP_USER", "equipo@gmail.com")
    monkeypatch.setattr("app.core.email.SMTP_PASSWORD", "clave-de-aplicacion")
    msg = email_module.build_message("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})

    _ENVIAR_SMTP_REAL(msg)

    assert SMTPFalso.last.calls == [
        ("conectar", "smtp.gmail.com", 587),
        ("starttls",),
        ("login", "equipo@gmail.com", "clave-de-aplicacion"),
        ("enviar", "ana@example.com"),
    ]


def test_sin_usuario_smtp_manda_directo_como_mailpit(monkeypatch):
    monkeypatch.setattr("app.core.email.smtplib.SMTP", SMTPFalso)
    monkeypatch.setattr("app.core.email.SMTP_HOST", "mailpit")
    monkeypatch.setattr("app.core.email.SMTP_PORT", 1025)
    monkeypatch.setattr("app.core.email.SMTP_USER", "")
    msg = email_module.build_message("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})

    _ENVIAR_SMTP_REAL(msg)

    assert SMTPFalso.last.calls == [("conectar", "mailpit", 1025), ("enviar", "ana@example.com")]


def test_en_vercel_el_mail_sale_antes_de_responder(monkeypatch, sent_mails):
    # En Vercel la función se congela al responder: una tarea en segundo
    # plano puede no correr nunca, así que el mail sale en el momento.
    monkeypatch.setattr("app.core.email.SEND_MAILS_IN_BACKGROUND", False)
    tasks = BackgroundTasks()

    email_module.schedule_mail(tasks, CORREO, "Hola", "verificar_correo", {"nombre": "Lucía", "enlace": "x"})

    assert len(sent_mails) == 1
    assert tasks.tasks == []


def test_fuera_de_vercel_el_mail_sale_en_segundo_plano(monkeypatch, sent_mails):
    monkeypatch.setattr("app.core.email.SEND_MAILS_IN_BACKGROUND", True)
    tasks = BackgroundTasks()

    email_module.schedule_mail(tasks, CORREO, "Hola", "verificar_correo", {"nombre": "Lucía", "enlace": "x"})

    assert sent_mails == []
    assert len(tasks.tasks) == 1


def test_el_log_no_guarda_el_correo_entero():
    assert email_module._mask("ana.perez@gmail.com") == "a***@gmail.com"


# =====================================================
# Verificar el correo
# =====================================================


def test_registrarse_manda_el_mail_de_verificacion(client, sent_mails):
    headers = registrar(client)

    assert len(sent_mails) == 1
    assert sent_mails[0]["To"] == CORREO
    assert "/verificar-correo?token=" in texto(sent_mails[0])
    assert client.get(ME, headers=headers).json()["email_verified"] is False


def test_el_enlace_del_mail_verifica_el_correo(client, sent_mails):
    headers = registrar(client)

    response = client.post(VERIFY, json={"token": mail_token(sent_mails[0])})

    assert response.status_code == 204
    assert client.get(ME, headers=headers).json()["email_verified"] is True


def test_usar_el_enlace_de_verificacion_de_nuevo_no_es_un_error(client, sent_mails):
    registrar(client)
    token = mail_token(sent_mails[0])
    client.post(VERIFY, json={"token": token})

    response = client.post(VERIFY, json={"token": token})

    assert response.status_code == 204


def test_enlace_de_verificacion_invalido_o_vencido(client, db_session):
    registrar(client)
    customer = db_session.scalars(select(Client)).one()
    expired = create_purpose_token(str(customer.user_id), VERIFY_EMAIL, minutes_count=-1)

    for token in ("cualquier-cosa", expired):
        response = client.post(VERIFY, json={"token": token})
        assert response.status_code == 400
        assert "no es válido o ya venció" in response.json()["detail"]

    db_session.refresh(customer)
    assert customer.email_verified is False


def test_un_enlace_de_recuperacion_no_sirve_para_verificar(client, db_session):
    registrar(client)
    customer = db_session.scalars(select(Client)).one()
    token = create_purpose_token(str(customer.user_id), RESET_PASSWORD, minutes_count=30)

    response = client.post(VERIFY, json={"token": token})

    assert response.status_code == 400


def test_el_enlace_del_mail_no_sirve_como_sesion(client, sent_mails):
    registrar(client)

    response = client.get(ME, headers={"Authorization": f"Bearer {mail_token(sent_mails[0])}"})

    assert response.status_code == 401


def test_reenviar_el_mail_de_verificacion(client, sent_mails):
    headers = registrar(client)

    response = client.post(RESEND, headers=headers)

    assert response.status_code == 204
    assert len(sent_mails) == 2
    assert "/verificar-correo?token=" in texto(sent_mails[1])


def test_con_el_correo_verificado_no_se_reenvia(client, sent_mails):
    headers = registrar(client)
    client.post(VERIFY, json={"token": mail_token(sent_mails[0])})

    response = client.post(RESEND, headers=headers)

    assert response.status_code == 204
    assert len(sent_mails) == 1


def test_reenviar_requiere_sesion(client):
    assert client.post(RESEND).status_code == 401


# =====================================================
# Recuperar la contraseña
# =====================================================


def test_pedir_recuperacion_manda_el_enlace(client, sent_mails):
    registrar(client)
    sent_mails.clear()

    response = client.post(FORGOT, json={"email": "Lucia@Example.com"})

    assert response.status_code == 202
    assert len(sent_mails) == 1
    assert sent_mails[0]["To"] == CORREO
    assert "/restablecer-password?token=" in texto(sent_mails[0])


def test_con_un_correo_inexistente_la_respuesta_es_la_misma(client, sent_mails):
    registrar(client)
    sent_mails.clear()

    registered = client.post(FORGOT, json={"email": CORREO})
    inexistente = client.post(FORGOT, json={"email": "nadie@example.com"})

    assert inexistente.status_code == registered.status_code == 202
    assert inexistente.json() == registered.json()
    assert len(sent_mails) == 1  # solo el del correo registrado


def test_recuperar_la_contrasena_con_el_enlace(client, sent_mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = mail_token(sent_mails[-1])
    sent_mails.clear()

    response = client.post(RESET, json={"token": token, "new_password": PASSWORD_NUEVA})

    assert response.status_code == 204
    assert can_enter(client, PASSWORD_NUEVA)
    assert not can_enter(client, PASSWORD_ACTUAL)
    assert len(sent_mails) == 1
    assert sent_mails[0]["Subject"] == "Tu contraseña de AutoBought se cambió"


def test_recuperar_la_contrasena_tambien_verifica_el_correo(client, db_session, sent_mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})

    client.post(RESET, json={"token": mail_token(sent_mails[-1]), "new_password": PASSWORD_NUEVA})

    assert db_session.scalars(select(Client)).one().email_verified is True


def test_el_enlace_de_recuperacion_sirve_una_sola_vez(client, sent_mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = mail_token(sent_mails[-1])
    client.post(RESET, json={"token": token, "new_password": PASSWORD_NUEVA})

    response = client.post(RESET, json={"token": token, "new_password": "Otra2026xy"})

    assert response.status_code == 400
    assert "no es válido o ya venció" in response.json()["detail"]
    assert can_enter(client, PASSWORD_NUEVA)


def test_el_enlace_de_recuperacion_vence(client, db_session):
    registrar(client)
    customer = db_session.scalars(select(Client)).one()
    expired = create_purpose_token(
        str(customer.user_id),
        RESET_PASSWORD,
        minutes_count=-1,
        extra_claims={"pwd": password_fingerprint(customer.password)},
    )

    response = client.post(RESET, json={"token": expired, "new_password": PASSWORD_NUEVA})

    assert response.status_code == 400
    assert can_enter(client, PASSWORD_ACTUAL)


def test_un_enlace_de_verificacion_no_sirve_para_recuperar(client, sent_mails):
    registrar(client)

    response = client.post(RESET, json={"token": mail_token(sent_mails[0]), "new_password": PASSWORD_NUEVA})

    assert response.status_code == 400
    assert can_enter(client, PASSWORD_ACTUAL)


def test_la_contrasena_nueva_tiene_que_ser_segura(client, sent_mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = mail_token(sent_mails[-1])

    debil = client.post(RESET, json={"token": token, "new_password": "corta"})
    with_email = client.post(RESET, json={"token": token, "new_password": "lucia2026x"})

    assert debil.status_code == 422
    assert with_email.status_code == 422
    assert "no puede contener tu correo" in with_email.json()["detail"]
    assert can_enter(client, PASSWORD_ACTUAL)


# =====================================================
# Aviso de cambio de contraseña
# =====================================================


def test_cambiar_la_contrasena_desde_el_perfil_manda_el_aviso(client, sent_mails):
    headers = registrar(client)
    sent_mails.clear()

    response = client.patch(PASSWORD, headers=headers, json={
        "current_password": PASSWORD_ACTUAL,
        "new_password": PASSWORD_NUEVA,
    })

    assert response.status_code == 200
    assert len(sent_mails) == 1
    assert sent_mails[0]["To"] == CORREO
    assert "¿No fuiste vos?" in texto(sent_mails[0])
    assert "/recuperar-password" in texto(sent_mails[0])


def test_si_el_cambio_falla_no_hay_aviso(client, sent_mails):
    headers = registrar(client)
    sent_mails.clear()

    client.patch(PASSWORD, headers=headers, json={
        "current_password": "incorrecta1",
        "new_password": PASSWORD_NUEVA,
    })

    assert sent_mails == []


# =====================================================
# Límite de mails de cuenta
# =====================================================


def test_la_recuperacion_deja_de_mandar_mails_al_llegar_al_limite(client, sent_mails):
    registrar(client)
    sent_mails.clear()

    responses = [client.post(FORGOT, json={"email": CORREO}) for _ in range(7)]

    # La respuesta no cambia (no revela nada), pero salen como mucho 5 mails.
    assert {r.status_code for r in responses} == {202}
    assert len(sent_mails) == 5


def test_reenviar_la_verificacion_tiene_limite(client, sent_mails):
    headers = registrar(client)

    code_list = [client.post(RESEND, headers=headers).status_code for _ in range(6)]

    assert code_list[:5] == [204] * 5
    assert code_list[5] == 429
