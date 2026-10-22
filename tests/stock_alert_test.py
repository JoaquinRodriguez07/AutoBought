from app.core.security import create_access_token
from app.models.client import Client
from app.models.part import Part
from app.models.stock_alert import StockAlert

ALERTS = "/api/v1/stock-alerts"


def make_client(db_session, username="ana", email="ana@example.com"):
    cliente = Client(username=username, password="secret", name="Ana", email=email)
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)
    return cliente


def make_part(db_session, stock=0, part_code="FAR-001"):
    part = Part(part_code=part_code, name="Faro delantero", category="Carrocería", price=8900, stock=stock)
    db_session.add(part)
    db_session.commit()
    db_session.refresh(part)
    return part


def auth_headers(user):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": "client"})
    return {"Authorization": f"Bearer {token}"}


def test_suscribirse_a_un_repuesto_agotado(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)

    assert client.get(ALERTS, headers=headers).json() == {"part_ids": []}
    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 204
    assert client.get(ALERTS, headers=headers).json() == {"part_ids": [part.id]}


def test_suscribirse_dos_veces_deja_una_sola(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)

    client.put(f"{ALERTS}/{part.id}", headers=headers)
    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 204
    assert db_session.query(StockAlert).count() == 1


def test_con_stock_no_hace_falta_aviso(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session, stock=3)

    response = client.put(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == 409
    assert "ya lo podés comprar" in response.json()["detail"]
    assert db_session.query(StockAlert).count() == 0


def test_repuesto_inexistente(client, db_session):
    headers = auth_headers(make_client(db_session))

    assert client.put(f"{ALERTS}/9999", headers=headers).status_code == 404


def test_cancelar_la_suscripcion(client, db_session):
    headers = auth_headers(make_client(db_session))
    part = make_part(db_session)
    client.put(f"{ALERTS}/{part.id}", headers=headers)

    response = client.delete(f"{ALERTS}/{part.id}", headers=headers)
    sin_suscripcion = client.delete(f"{ALERTS}/{part.id}", headers=headers)

    assert response.status_code == sin_suscripcion.status_code == 204
    assert client.get(ALERTS, headers=headers).json() == {"part_ids": []}


def test_cada_cliente_ve_solo_sus_suscripciones(client, db_session):
    ana = make_client(db_session)
    beto = make_client(db_session, username="beto", email="beto@example.com")
    part = make_part(db_session)
    client.put(f"{ALERTS}/{part.id}", headers=auth_headers(ana))

    assert client.get(ALERTS, headers=auth_headers(beto)).json() == {"part_ids": []}


def test_requiere_sesion(client, db_session):
    part = make_part(db_session)

    assert client.get(ALERTS).status_code == 401
    assert client.put(f"{ALERTS}/{part.id}").status_code == 401
    assert client.delete(f"{ALERTS}/{part.id}").status_code == 401
