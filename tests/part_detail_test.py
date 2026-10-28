from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def crear_repuesto(db_session):
    modelo = CarModel(brand="Toyota", model="Corolla", engine_code="2ZR")
    repuesto = Part(
        part_code="BRK-001",
        name="Brake pad",
        manufacturer="Bosch",
        category="Brakes",
        price=12500,
        stock=5,
        description="Front brake pad",
        specifications=[["Position", "Front"]],
        warranty_months=12,
        warranty_provider="fabricante",
        compatibilities=[
            Compatibility(car_model=modelo, year_from=2018, year_to=2020)
        ],
    )
    db_session.add(repuesto)
    db_session.commit()
    db_session.refresh(repuesto)
    return repuesto


def test_part_detail_matches_list_item_shape(client, db_session):
    repuesto = crear_repuesto(db_session)

    listado = client.get("/api/v1/parts")
    detalle = client.get(f"/api/v1/parts/{repuesto.id}")

    assert listado.status_code == 200
    assert detalle.status_code == 200
    assert detalle.json() == listado.json()["parts"][0]
    assert detalle.json()["compatibilities"] == [
        {
            "brand": "Toyota",
            "model": "Corolla",
            "engine_code": "2ZR",
            "year_from": 2018,
            "year_to": 2020,
        }
    ]


def test_part_detail_returns_404_for_unknown_id(client):
    response = client.get("/api/v1/parts/999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Repuesto no encontrado."}
