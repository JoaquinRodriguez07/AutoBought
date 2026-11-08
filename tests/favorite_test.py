"""Tests de los favoritos."""

from sqlalchemy import select

from app.core.security import create_access_token
from app.models.car_model import CarModel
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.favorite import Favorite
from app.models.part import Part

FAVORITES = "/api/v1/favorites"


def make_client(db_session, username="ana", email="ana@example.com"):
    customer = Client(username=username, password="secret", name="Ana", email=email)
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    return customer


def make_part(db_session, **overrides):
    defaults = dict(part_code="BRK-001", name="Pastillas de freno", manufacturer="Bosch", category="Frenos", price=1000, stock=5)
    defaults.update(overrides)
    part = Part(**defaults)
    db_session.add(part)
    db_session.commit()
    db_session.refresh(part)
    return part


def auth_headers(user, user_type="client"):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": user_type})
    return {"Authorization": f"Bearer {token}"}


def test_list_empty_for_customer_new(client, db_session):
    ana = make_client(db_session)

    response = client.get(FAVORITES, headers=auth_headers(ana))

    assert response.status_code == 200
    assert response.json() == {"parts": []}


def test_mark_favorite_appears_in_the_list_with_data_of_the_part(client, db_session):
    ana = make_client(db_session)
    part = make_part(db_session)
    car = CarModel(brand="Volkswagen", model="Gol", engine_code="EA111")
    db_session.add(car)
    db_session.commit()
    db_session.add(Compatibility(part_id=part.id, car_model_id=car.id, year_from=2010, year_to=2015))
    db_session.commit()

    put = client.put(f"{FAVORITES}/{part.id}", headers=auth_headers(ana))
    response = client.get(FAVORITES, headers=auth_headers(ana))

    assert put.status_code == 204
    parts = response.json()["parts"]
    assert [p["id"] for p in parts] == [part.id]
    assert parts[0]["name"] == "Pastillas de freno"
    assert parts[0]["compatible_brands"] == ["Volkswagen"]


def test_the_list_respects_the_order_in_that_were_marked(client, db_session):
    ana = make_client(db_session)
    first = make_part(db_session, part_code="A")
    segundo = make_part(db_session, part_code="B")

    client.put(f"{FAVORITES}/{segundo.id}", headers=auth_headers(ana))
    client.put(f"{FAVORITES}/{first.id}", headers=auth_headers(ana))

    ids = [p["id"] for p in client.get(FAVORITES, headers=auth_headers(ana)).json()["parts"]]
    assert ids == [segundo.id, first.id]


def test_mark_two_times_no_duplicates(client, db_session):
    ana = make_client(db_session)
    part = make_part(db_session)

    assert client.put(f"{FAVORITES}/{part.id}", headers=auth_headers(ana)).status_code == 204
    assert client.put(f"{FAVORITES}/{part.id}", headers=auth_headers(ana)).status_code == 204

    assert len(client.get(FAVORITES, headers=auth_headers(ana)).json()["parts"]) == 1
    assert len(db_session.scalars(select(Favorite)).all()) == 1


def test_mark_part_nonexistent_returns_404(client, db_session):
    ana = make_client(db_session)

    response = client.put(f"{FAVORITES}/999", headers=auth_headers(ana))

    assert response.status_code == 404
    assert db_session.scalars(select(Favorite)).all() == []


def test_remove_favorite_leaves_of_appear(client, db_session):
    ana = make_client(db_session)
    part = make_part(db_session)
    client.put(f"{FAVORITES}/{part.id}", headers=auth_headers(ana))

    response = client.delete(f"{FAVORITES}/{part.id}", headers=auth_headers(ana))

    assert response.status_code == 204
    assert client.get(FAVORITES, headers=auth_headers(ana)).json() == {"parts": []}


def test_remove_a_favorite_that_no_was_returns_204(client, db_session):
    ana = make_client(db_session)
    part = make_part(db_session)

    assert client.delete(f"{FAVORITES}/{part.id}", headers=auth_headers(ana)).status_code == 204


def test_no_see_nor_remove_favorites_of_another_customer(client, db_session):
    ana = make_client(db_session)
    beto = make_client(db_session, username="beto", email="beto@example.com")
    part = make_part(db_session)
    client.put(f"{FAVORITES}/{part.id}", headers=auth_headers(ana))

    beto_list = client.get(FAVORITES, headers=auth_headers(beto)).json()
    client.delete(f"{FAVORITES}/{part.id}", headers=auth_headers(beto))

    assert beto_list == {"parts": []}
    assert [p["id"] for p in client.get(FAVORITES, headers=auth_headers(ana)).json()["parts"]] == [part.id]


def test_favorites_require_token(client):
    assert client.get(FAVORITES).status_code == 401
    assert client.put(f"{FAVORITES}/1").status_code == 401
    assert client.delete(f"{FAVORITES}/1").status_code == 401


def test_favorites_reject_employees(client, db_session):
    ana = make_client(db_session)

    assert client.get(FAVORITES, headers=auth_headers(ana, user_type="employee")).status_code == 403
