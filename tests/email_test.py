import re
import smtplib

from sqlalchemy import select

from app.core import email as email_module
from app.core.security import (
    RECUPERAR_PASSWORD,
    VERIFICAR_CORREO,
    create_purpose_token,
    huella_password,
)
from app.models.client import Client

# Se guarda antes de que el fixture `mails` lo reemplace en cada test.
_ENVIAR_SMTP_REAL = email_module._enviar_smtp

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


def texto(mensaje):
    return mensaje.get_body(preferencelist=("plain",)).get_content()


def html(mensaje):
    return mensaje.get_body(preferencelist=("html",)).get_content()


def token_del_mail(mensaje):
    return re.search(r"token=([\w.\-]+)", texto(mensaje)).group(1)


def puede_entrar(client, password):
    response = client.post(LOGIN, json={"email": CORREO, "password": password})
    return response.status_code == 200


# =====================================================
# Mails: armado y envío
# =====================================================


def test_el_mail_tiene_version_html_y_texto_con_el_enlace():
    mensaje = email_module.armar_mensaje(
        "ana@example.com",
        "Asunto",
        "verificar_correo",
        {"nombre": "Ana", "enlace": "http://front/verificar-correo?token=abc"},
    )

    assert mensaje["To"] == "ana@example.com"
    assert mensaje["Subject"] == "Asunto"
    assert "Hola Ana" in texto(mensaje)
    assert "http://front/verificar-correo?token=abc" in texto(mensaje)
    assert "Verificá tu correo" in html(mensaje)  # título de la plantilla base
    assert 'href="http://front/verificar-correo?token=abc"' in html(mensaje)


def test_el_html_escapa_los_datos_del_usuario():
    mensaje = email_module.armar_mensaje(
        "ana@example.com", "Asunto", "verificar_correo", {"nombre": "<b>Ana</b>", "enlace": "x"}
    )

    assert "<b>Ana</b>" not in html(mensaje)
    assert "&lt;b&gt;Ana&lt;/b&gt;" in html(mensaje)


def test_si_el_envio_falla_no_corta_la_accion(monkeypatch):
    def falla(_mensaje):
        raise smtplib.SMTPException("sin conexión")

    monkeypatch.setattr("app.core.email._enviar_smtp", falla)

    email_module.enviar_mail("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})


class SMTPFalso:
    def __init__(self, host, port, timeout):
        self.llamadas = [("conectar", host, port)]
        SMTPFalso.ultimo = self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def starttls(self):
        self.llamadas.append(("starttls",))

    def login(self, user, password):
        self.llamadas.append(("login", user, password))

    def send_message(self, mensaje):
        self.llamadas.append(("enviar", mensaje["To"]))


def test_con_usuario_smtp_cifra_e_inicia_sesion_como_pide_gmail(monkeypatch):
    monkeypatch.setattr("app.core.email.smtplib.SMTP", SMTPFalso)
    monkeypatch.setattr("app.core.email.SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr("app.core.email.SMTP_PORT", 587)
    monkeypatch.setattr("app.core.email.SMTP_USER", "equipo@gmail.com")
    monkeypatch.setattr("app.core.email.SMTP_PASSWORD", "clave-de-aplicacion")
    mensaje = email_module.armar_mensaje("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})

    _ENVIAR_SMTP_REAL(mensaje)

    assert SMTPFalso.ultimo.llamadas == [
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
    mensaje = email_module.armar_mensaje("ana@example.com", "Asunto", "verificar_correo", {"nombre": "Ana", "enlace": "x"})

    _ENVIAR_SMTP_REAL(mensaje)

    assert SMTPFalso.ultimo.llamadas == [("conectar", "mailpit", 1025), ("enviar", "ana@example.com")]


# =====================================================
# Verificar el correo
# =====================================================


def test_registrarse_manda_el_mail_de_verificacion(client, mails):
    headers = registrar(client)

    assert len(mails) == 1
    assert mails[0]["To"] == CORREO
    assert "/verificar-correo?token=" in texto(mails[0])
    assert client.get(ME, headers=headers).json()["email_verified"] is False


def test_el_enlace_del_mail_verifica_el_correo(client, mails):
    headers = registrar(client)

    response = client.post(VERIFY, json={"token": token_del_mail(mails[0])})

    assert response.status_code == 204
    assert client.get(ME, headers=headers).json()["email_verified"] is True


def test_usar_el_enlace_de_verificacion_de_nuevo_no_es_un_error(client, mails):
    registrar(client)
    token = token_del_mail(mails[0])
    client.post(VERIFY, json={"token": token})

    response = client.post(VERIFY, json={"token": token})

    assert response.status_code == 204


def test_enlace_de_verificacion_invalido_o_vencido(client, db_session):
    registrar(client)
    cliente = db_session.scalars(select(Client)).one()
    vencido = create_purpose_token(str(cliente.user_id), VERIFICAR_CORREO, minutos=-1)

    for token in ("cualquier-cosa", vencido):
        response = client.post(VERIFY, json={"token": token})
        assert response.status_code == 400
        assert "no es válido o ya venció" in response.json()["detail"]

    db_session.refresh(cliente)
    assert cliente.email_verified is False


def test_un_enlace_de_recuperacion_no_sirve_para_verificar(client, db_session):
    registrar(client)
    cliente = db_session.scalars(select(Client)).one()
    token = create_purpose_token(str(cliente.user_id), RECUPERAR_PASSWORD, minutos=30)

    response = client.post(VERIFY, json={"token": token})

    assert response.status_code == 400


def test_el_enlace_del_mail_no_sirve_como_sesion(client, mails):
    registrar(client)

    response = client.get(ME, headers={"Authorization": f"Bearer {token_del_mail(mails[0])}"})

    assert response.status_code == 401


def test_reenviar_el_mail_de_verificacion(client, mails):
    headers = registrar(client)

    response = client.post(RESEND, headers=headers)

    assert response.status_code == 204
    assert len(mails) == 2
    assert "/verificar-correo?token=" in texto(mails[1])


def test_con_el_correo_verificado_no_se_reenvia(client, mails):
    headers = registrar(client)
    client.post(VERIFY, json={"token": token_del_mail(mails[0])})

    response = client.post(RESEND, headers=headers)

    assert response.status_code == 204
    assert len(mails) == 1


def test_reenviar_requiere_sesion(client):
    assert client.post(RESEND).status_code == 401


# =====================================================
# Recuperar la contraseña
# =====================================================


def test_pedir_recuperacion_manda_el_enlace(client, mails):
    registrar(client)
    mails.clear()

    response = client.post(FORGOT, json={"email": "Lucia@Example.com"})

    assert response.status_code == 202
    assert len(mails) == 1
    assert mails[0]["To"] == CORREO
    assert "/restablecer-password?token=" in texto(mails[0])


def test_con_un_correo_inexistente_la_respuesta_es_la_misma(client, mails):
    registrar(client)
    mails.clear()

    registrado = client.post(FORGOT, json={"email": CORREO})
    inexistente = client.post(FORGOT, json={"email": "nadie@example.com"})

    assert inexistente.status_code == registrado.status_code == 202
    assert inexistente.json() == registrado.json()
    assert len(mails) == 1  # solo el del correo registrado


def test_recuperar_la_contrasena_con_el_enlace(client, mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = token_del_mail(mails[-1])
    mails.clear()

    response = client.post(RESET, json={"token": token, "new_password": PASSWORD_NUEVA})

    assert response.status_code == 204
    assert puede_entrar(client, PASSWORD_NUEVA)
    assert not puede_entrar(client, PASSWORD_ACTUAL)
    assert len(mails) == 1
    assert mails[0]["Subject"] == "Tu contraseña de AutoBought se cambió"


def test_recuperar_la_contrasena_tambien_verifica_el_correo(client, db_session, mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})

    client.post(RESET, json={"token": token_del_mail(mails[-1]), "new_password": PASSWORD_NUEVA})

    assert db_session.scalars(select(Client)).one().email_verified is True


def test_el_enlace_de_recuperacion_sirve_una_sola_vez(client, mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = token_del_mail(mails[-1])
    client.post(RESET, json={"token": token, "new_password": PASSWORD_NUEVA})

    response = client.post(RESET, json={"token": token, "new_password": "Otra2026xy"})

    assert response.status_code == 400
    assert "no es válido o ya venció" in response.json()["detail"]
    assert puede_entrar(client, PASSWORD_NUEVA)


def test_el_enlace_de_recuperacion_vence(client, db_session):
    registrar(client)
    cliente = db_session.scalars(select(Client)).one()
    vencido = create_purpose_token(
        str(cliente.user_id),
        RECUPERAR_PASSWORD,
        minutos=-1,
        extra_claims={"pwd": huella_password(cliente.password)},
    )

    response = client.post(RESET, json={"token": vencido, "new_password": PASSWORD_NUEVA})

    assert response.status_code == 400
    assert puede_entrar(client, PASSWORD_ACTUAL)


def test_un_enlace_de_verificacion_no_sirve_para_recuperar(client, mails):
    registrar(client)

    response = client.post(RESET, json={"token": token_del_mail(mails[0]), "new_password": PASSWORD_NUEVA})

    assert response.status_code == 400
    assert puede_entrar(client, PASSWORD_ACTUAL)


def test_la_contrasena_nueva_tiene_que_ser_segura(client, mails):
    registrar(client)
    client.post(FORGOT, json={"email": CORREO})
    token = token_del_mail(mails[-1])

    debil = client.post(RESET, json={"token": token, "new_password": "corta"})
    con_correo = client.post(RESET, json={"token": token, "new_password": "lucia2026x"})

    assert debil.status_code == 422
    assert con_correo.status_code == 422
    assert "no puede contener tu correo" in con_correo.json()["detail"]
    assert puede_entrar(client, PASSWORD_ACTUAL)


# =====================================================
# Aviso de cambio de contraseña
# =====================================================


def test_cambiar_la_contrasena_desde_el_perfil_manda_el_aviso(client, mails):
    headers = registrar(client)
    mails.clear()

    response = client.patch(PASSWORD, headers=headers, json={
        "current_password": PASSWORD_ACTUAL,
        "new_password": PASSWORD_NUEVA,
    })

    assert response.status_code == 204
    assert len(mails) == 1
    assert mails[0]["To"] == CORREO
    assert "¿No fuiste vos?" in texto(mails[0])
    assert "/recuperar-password" in texto(mails[0])


def test_si_el_cambio_falla_no_hay_aviso(client, mails):
    headers = registrar(client)
    mails.clear()

    client.patch(PASSWORD, headers=headers, json={
        "current_password": "incorrecta1",
        "new_password": PASSWORD_NUEVA,
    })

    assert mails == []
