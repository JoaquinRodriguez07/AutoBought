from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def create_part(db_session):
    modelo = CarModel(brand="Toyota", model="Corolla", engine_code="2ZR")
    part_item = Part(
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
    db_session.add(part_item)
    db_session.commit()
    db_session.refresh(part_item)
    return part_item


def test_part_detail_matches_list_item_shape(client, db_session):
    part_item = create_part(db_session)

    listing = client.get("/api/v1/parts")
    detail = client.get(f"/api/v1/parts/{part_item.id}")

    assert listing.status_code == 200
    assert detail.status_code == 200
    assert detail.json() == listing.json()["parts"][0]
    assert detail.json()["compatibilities"] == [
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


def test_fabricantes_ordenados_por_cantidad_de_repuestos(client, db_session):
    create_part(db_session)
    for code in ("BRK-002", "BRK-003"):
        db_session.add(
            Part(part_code=code, name="Disco", manufacturer="Brembo", category="Brakes", price=900, stock=1)
        )
    db_session.commit()

    response = client.get("/api/v1/parts/manufacturers")

    assert response.status_code == 200
    assert response.json() == {
        "manufacturers": [{"name": "Brembo", "count": 2}, {"name": "Bosch", "count": 1}]
    }
