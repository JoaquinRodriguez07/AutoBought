from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def make_part(db_session):
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.0 Turbo")
    part = Part(part_code="BRK-0001", name="Pastillas de freno delanteras Chevrolet Onix",
                category="Frenos", price=3000, stock=5)
    part.compatibilities = [Compatibility(car_model=onix, year_from=2015, year_to=2020)]
    db_session.add(part)
    db_session.commit()
    return part


def test_repuesto_sin_complementarios_devuelve_lista_vacia(client, db_session):
    part = make_part(db_session)

    response = client.get("/api/v1/recommendations", params={"part_ids": str(part.id)})

    assert response.status_code == 200
    assert response.json() == {"parts": []}


def test_repuesto_inexistente_devuelve_404(client, db_session):
    part = make_part(db_session)

    response = client.get("/api/v1/recommendations", params={"part_ids": f"{part.id},999"})

    assert response.status_code == 404
    assert "999" in response.json()["detail"]


def test_part_ids_es_obligatorio(client):
    response = client.get("/api/v1/recommendations")

    assert response.status_code == 422


def test_part_ids_invalidos_devuelven_422(client):
    for raw in ("abc", "1,x", " , ", "-1"):
        response = client.get("/api/v1/recommendations", params={"part_ids": raw})
        assert response.status_code == 422, raw
