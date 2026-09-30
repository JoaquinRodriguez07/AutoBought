from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def make_catalog(db_session):
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.0 Turbo")
    cronos = CarModel(brand="Fiat", model="Cronos", engine_code="1.3 Firefly")

    parts = [
        Part(part_code="BRK-0001", name="Pastillas de freno delanteras Chevrolet Onix",
             category="Frenos", price=3000, stock=5),
        Part(part_code="BRK-0002", name="Pastillas de freno delanteras Fiat Cronos",
             category="Frenos", price=3000, stock=5),
        Part(part_code="FIL-0001", name="Filtro de aceite 1.0 Turbo",
             category="Filtros", price=800, stock=10),
    ]
    parts[0].compatibilities = [Compatibility(car_model=onix, year_from=2020, year_to=2024)]
    parts[1].compatibilities = [Compatibility(car_model=cronos, year_from=2018, year_to=2024)]
    parts[2].compatibilities = [Compatibility(car_model=onix, year_from=2020, year_to=2024)]

    db_session.add_all(parts)
    db_session.commit()


def test_extrae_pieza_modelo_y_anio(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "Pastillas de FRENO onix 2020!"})

    assert response.status_code == 200
    assert response.json()["entities"] == {
        "part": "pastillas de freno",
        "brand": "Chevrolet",
        "model": "Onix",
        "year": 2020,
    }


def test_mismos_resultados_que_los_filtros_en_cascada(client, db_session):
    make_catalog(db_session)

    cascada = client.get(
        "/api/v1/parts",
        params={"brand": "Chevrolet", "model": "Onix", "year": 2020, "categoria": "Frenos"},
    ).json()["parts"]
    texto = client.get(
        "/api/v1/parts", params={"q": "pastillas de freno onix 2020"}
    ).json()["parts"]

    assert len(cascada) > 0
    assert [p["id"] for p in texto] == [p["id"] for p in cascada]


def test_busqueda_sin_entidades_reconocibles(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "xyz qwerty"})

    assert response.status_code == 200
    assert response.json()["entities"] == {
        "part": None,
        "brand": None,
        "model": None,
        "year": None,
    }
    assert response.json()["parts"] == []


def test_respeta_los_filtros_explicitos(client, db_session):
    make_catalog(db_session)

    response = client.get(
        "/api/v1/parts", params={"q": "pastillas de freno", "brand": "Fiat"}
    )

    codes = [p["part_code"] for p in response.json()["parts"]]
    assert codes == ["BRK-0002"]


def test_ignora_palabras_de_mas(client, db_session):
    make_catalog(db_session)

    response = client.get(
        "/api/v1/parts", params={"q": "pastillas de freno para onix 2020"}
    )

    assert response.json()["entities"]["part"] == "pastillas de freno"
    codes = [p["part_code"] for p in response.json()["parts"]]
    assert codes == ["BRK-0001"]