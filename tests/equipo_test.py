"""SCRUM-175: un administrador da de alta y de baja vendedores."""

from urllib.parse import parse_qs, urlparse

import jwt
import pytest

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.employee import Employee
from order_test import auth_headers, make_client

EMPLEADOS = "/api/v1/employees"


def make_employee(db_session, email, name="Vendedor Uno", is_admin=False, password="secreto123"):
    return crud_user.create_employee(
        db_session, name=name, email=email, password_hash=hash_password(password), is_admin=is_admin
    )


@pytest.fixture
def admin(db_session):
    return make_employee(db_session, "admin@example.com", name="Ana Admin", is_admin=True)


@pytest.fixture
def seller(db_session):
    return make_employee(db_session, "beto@example.com", name="Beto Vendedor")


def as_user(employee):
    return auth_headers(employee, "employee")


def login(client, email, password="secreto123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def link_in_mail(mail_message) -> str:
    texto = mail_message.get_body(preferencelist=("plain",)).get_content()
    return next(line for line in texto.splitlines() if "/restablecer-password?token=" in line).strip()


def link_token(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


# =====================================================
# Permisos
# =====================================================


@pytest.mark.parametrize(
    "metodo, ruta, body",
    [("get", EMPLEADOS, None), ("post", EMPLEADOS, {"name": "Caro Nueva", "email": "caro@example.com"}), ("delete", f"{EMPLEADOS}/1", None)],
)
def test_a_seller_common_no_can_manage_the_team(client, seller, metodo, ruta, body):
    kwargs = {"headers": as_user(seller)}
    if body:
        kwargs["json"] = body

    response = getattr(client, metodo)(ruta, **kwargs)

    assert response.status_code == 403
    assert response.json()["detail"] == "Esta acción requiere ser administrador."


def test_a_customer_no_can_manage_the_team(client, db_session):
    customer = make_client(db_session)

    assert client.get(EMPLEADOS, headers=auth_headers(customer)).status_code == 403


def test_without_session_gives_401(client):
    assert client.get(EMPLEADOS).status_code == 401


def test_the_token_says_if_is_admin(client, admin, seller):
    def claims(email):
        token = login(client, email).json()["access_token"]
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])

    assert claims("admin@example.com")["admin"] is True
    assert "admin" not in claims("beto@example.com")


# =====================================================
# Lista
# =====================================================


def test_list_the_sellers_active_by_name(client, db_session, admin, seller):
    deactivated = make_employee(db_session, "caro@example.com", name="Caro Ex")
    crud_user.deactivate_employee(db_session, deactivated)

    response = client.get(EMPLEADOS, headers=as_user(admin))

    assert response.status_code == 200
    assert response.json()["employees"] == [
        {"id": admin.user_id, "name": "Ana Admin", "email": "admin@example.com", "is_admin": True},
        {"id": seller.user_id, "name": "Beto Vendedor", "email": "beto@example.com", "is_admin": False},
    ]


# =====================================================
# Alta
# =====================================================


def test_signup_creates_the_seller_and_sends_the_mail_for_choose_password(client, db_session, admin, sent_mails):
    response = client.post(EMPLEADOS, json={"name": "Caro Nueva", "email": "Caro@Example.com"}, headers=as_user(admin))

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Caro Nueva"
    assert body["email"] == "caro@example.com"
    assert body["is_admin"] is False
    new_item = db_session.get(Employee, body["id"])
    assert new_item.active

    assert len(sent_mails) == 1
    assert sent_mails[0]["To"] == "caro@example.com"
    assert sent_mails[0]["Subject"] == "Te sumaron al equipo de AutoBought"
    texto = sent_mails[0].get_body(preferencelist=("plain",)).get_content()
    assert "Ana Admin te sumó al equipo" in texto


def test_with_the_link_of_the_mail_chooses_its_password_and_enters_to_the_portal(client, admin, sent_mails):
    client.post(EMPLEADOS, json={"name": "Caro Nueva", "email": "caro@example.com"}, headers=as_user(admin))
    # Antes de elegirla no puede entrar (nadie conoce la contraseña al azar).
    assert login(client, "caro@example.com", "Mostrador2026").status_code == 401

    token = link_token(link_in_mail(sent_mails[0]))
    reset = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "Mostrador2026"})

    assert reset.status_code == 204
    response = login(client, "caro@example.com", "Mostrador2026")
    assert response.status_code == 200
    claims = jwt.decode(response.json()["access_token"], SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert claims["user_type"] == "employee"
    # El enlace sirve una sola vez.
    another = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "OtraClave2026"})
    assert another.status_code == 400


@pytest.mark.parametrize("email", ["beto@example.com", "ana@example.com"])
def test_signup_with_a_email_in_usage_gives_409(client, db_session, admin, seller, sent_mails, email):
    make_client(db_session)  # ana@example.com

    response = client.post(EMPLEADOS, json={"name": "Otro Nombre", "email": email}, headers=as_user(admin))

    assert response.status_code == 409
    assert sent_mails == []


@pytest.mark.parametrize("body", [{"name": "", "email": "caro@example.com"}, {"name": "Caro", "email": "no-es-un-correo"}])
def test_signup_with_data_invalid_gives_422(client, admin, sent_mails, body):
    assert client.post(EMPLEADOS, json=body, headers=as_user(admin)).status_code == 422
    assert sent_mails == []


def test_go_back_a_give_of_signup_a_seller_given_of_removal_it_reactivates(client, db_session, admin, seller, sent_mails):
    client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin))

    response = client.post(EMPLEADOS, json={"name": "Beto Vuelve", "email": "beto@example.com"}, headers=as_user(admin))

    assert response.status_code == 201
    assert response.json()["id"] == seller.user_id
    db_session.expire_all()
    assert db_session.get(Employee, seller.user_id).active
    assert db_session.get(Employee, seller.user_id).name == "Beto Vuelve"
    # La contraseña vieja ya no sirve: elige una nueva con el mail.
    assert login(client, "beto@example.com").status_code == 401
    assert len(sent_mails) == 1


# =====================================================
# Baja
# =====================================================


def test_removal_it_removes_of_the_team_and_closes_its_sessions(client, db_session, admin, seller):
    open_session = login(client, "beto@example.com").json()["access_token"]

    response = client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin))

    assert response.status_code == 204
    db_session.expire_all()
    assert not db_session.get(Employee, seller.user_id).active
    names = [e["name"] for e in client.get(EMPLEADOS, headers=as_user(admin)).json()["employees"]]
    assert names == ["Ana Admin"]
    # La sesión que tenía abierta deja de valer.
    headers = {"Authorization": f"Bearer {open_session}"}
    assert client.get("/api/v1/analytics/ping", headers=headers).status_code == 401
    assert client.post("/api/v1/auth/refresh", headers=headers).status_code == 401


def test_a_seller_given_of_removal_no_can_enter(client, admin, seller):
    client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin))

    response = login(client, "beto@example.com")

    assert response.status_code == 403
    assert "dada de baja" in response.json()["detail"]


def test_a_seller_given_of_removal_no_receives_the_mail_of_recover_the_password(client, admin, seller, sent_mails):
    client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin))

    response = client.post("/api/v1/auth/password/forgot", json={"email": "beto@example.com"})

    assert response.status_code == 202
    assert sent_mails == []


def test_a_link_old_no_works_after_of_the_removal(client, admin, seller, sent_mails):
    client.post("/api/v1/auth/password/forgot", json={"email": "beto@example.com"})
    token = link_token(link_in_mail(sent_mails[0]))
    client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin))

    response = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "Mostrador2026"})

    assert response.status_code == 400


def test_a_admin_no_can_unsubscribe_of_removal_a_if_same(client, db_session, admin):
    response = client.delete(f"{EMPLEADOS}/{admin.user_id}", headers=as_user(admin))

    assert response.status_code == 400
    assert response.json()["detail"] == "No podés darte de baja a vos mismo."
    db_session.expire_all()
    assert db_session.get(Employee, admin.user_id).active


def test_give_of_removal_a_customer_or_a_someone_that_no_exists_gives_404(client, db_session, admin):
    customer = make_client(db_session)

    assert client.delete(f"{EMPLEADOS}/{customer.user_id}", headers=as_user(admin)).status_code == 404
    assert client.delete(f"{EMPLEADOS}/99999", headers=as_user(admin)).status_code == 404


def test_give_of_removal_two_times_gives_404(client, admin, seller):
    assert client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin)).status_code == 204
    assert client.delete(f"{EMPLEADOS}/{seller.user_id}", headers=as_user(admin)).status_code == 404


# =====================================================
# Migración y seed
# =====================================================


def test_the_seller_of_the_seed_is_admin(db_session):
    from scripts import seed_demo_users

    data = next(v for v in seed_demo_users.VENDEDORES if v["email"] == "vendedor@autobought.com")
    seed_demo_users.create_seller(db_session, data)

    assert crud_user.get_user_by_email(db_session, "vendedor@autobought.com").is_admin
