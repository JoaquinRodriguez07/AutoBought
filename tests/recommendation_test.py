"""Tests de las recomendaciones de repuestos complementarios."""

from sqlalchemy import select

from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def make_part(db_session, code, name, category, stock, *compatibilities):
    part = Part(part_code=code, name=name, manufacturer="Bosch", category=category, price=1000, stock=stock)
    part.compatibilities = [
        Compatibility(car_model=car_model, year_from=year_from, year_to=year_to)
        for car_model, year_from, year_to in compatibilities
    ]
    db_session.add(part)
    return part


def make_catalog(db_session):
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.4 SPE/4")
    cronos = CarModel(brand="Fiat", model="Cronos", engine_code="1.3 Firefly")

    parts = {
        "filtro_onix": make_part(db_session, "FIL-0001", "Filtro de aceite 1.4 SPE/4",
                                 "Filtros", 10, (onix, 2013, 2020)),
        "bujia_onix": make_part(db_session, "IGN-0001", "Bujía 1.4 SPE/4",
                                "Encendido", 8, (onix, 2013, 2020)),
        "bobina_onix": make_part(db_session, "IGN-0002", "Bobina de encendido 1.4 SPE/4",
                                 "Encendido", 3, (onix, 2013, 2020)),
        "bujia_sin_stock": make_part(db_session, "IGN-0003", "Bujía iridio 1.4 SPE/4",
                                     "Encendido", 0, (onix, 2013, 2020)),
        "bujia_cronos": make_part(db_session, "IGN-0004", "Bujía 1.3 Firefly",
                                  "Encendido", 8, (cronos, 2018, 2024)),
        "bujia_onix_nuevo": make_part(db_session, "IGN-0005", "Bujía 1.0 Turbo",
                                      "Encendido", 8, (onix, 2021, 2024)),
        "filtro_aire_onix": make_part(db_session, "FIL-0002", "Filtro de aire 1.4 SPE/4",
                                      "Filtros", 5, (onix, 2013, 2020)),
        "filtro_sin_stock": make_part(db_session, "FIL-0003", "Filtro de habitáculo 1.4 SPE/4",
                                      "Filtros", 0, (onix, 2013, 2020)),
        "filtro_cronos": make_part(db_session, "FIL-0004", "Filtro de aceite 1.3 Firefly",
                                   "Filtros", 7, (cronos, 2018, 2024)),
        "filtro_onix_nuevo": make_part(db_session, "FIL-0005", "Filtro de aceite 1.0 Turbo",
                                       "Filtros", 7, (onix, 2021, 2024)),
        "cables_onix": make_part(db_session, "IGN-0006", "Cables de bujía 1.4 SPE/4",
                                 "Encendido", 4, (onix, 2013, 2020)),
        # Se crea después de los de Encendido para que el orden por prioridad de
        # categoría no coincida con el orden por id.
        "aceite": make_part(db_session, "LUB-0001", "Aceite de motor 5W30 4L",
                            "Lubricantes", 20, (onix, 2013, 2020), (cronos, 2018, 2024)),
        "pastillas_cronos": make_part(db_session, "BRK-0001", "Pastillas de freno Fiat Cronos",
                                      "Frenos", 5, (cronos, 2018, 2024)),
        "amortiguador_cronos_sin_stock": make_part(
            db_session, "SUS-0001", "Amortiguador delantero Fiat Cronos",
            "Suspensión", 0, (cronos, 2018, 2024)),
        "llavero": make_part(db_session, "OTR-0001", "Llavero AutoBought",
                             "Otros", 50, (onix, 2013, 2020)),
    }
    db_session.commit()
    return parts


def is_compatible(db_session, part_id, brand, model, year):
    """Verifica en la tabla Compatibility (y no en el rango agregado de
    PartOut, que mezcla todos los vehículos) que el repuesto sirva para ese
    vehículo y año."""
    query = (
        select(Compatibility)
        .join(CarModel)
        .where(
            Compatibility.part_id == part_id,
            CarModel.brand == brand,
            CarModel.model == model,
            Compatibility.year_from <= year,
            Compatibility.year_to >= year,
        )
    )
    return db_session.scalars(query).first() is not None


def recommend(client, *parts):
    return client.get(
        "/api/v1/recommendations",
        params={"part_ids": ",".join(str(part.id) for part in parts)},
    )


# Escenario: Sugerencias para un repuesto del carrito
def test_suggestions_for_a_part_of_the_cart(client, db_session):
    # Dado un repuesto con stock compatible con Chevrolet Onix 2015
    parts = make_catalog(db_session)
    filter_part = parts["filtro_onix"]
    assert filter_part.stock > 0
    assert is_compatible(db_session, filter_part.id, "Chevrolet", "Onix", 2015)

    # Cuando se solicitan recomendaciones para ese repuesto
    response = recommend(client, filter_part)

    # Entonces la API devuelve entre 1 y 3 repuestos
    assert response.status_code == 200
    suggested_items = response.json()["parts"]
    assert 1 <= len(suggested_items) <= 3
    for suggested in suggested_items:
        # Y todos son compatibles con Chevrolet Onix 2015
        assert is_compatible(db_session, suggested["id"], "Chevrolet", "Onix", 2015)
        # Y ninguno es el mismo repuesto consultado
        assert suggested["id"] != filter_part.id
        # Y todos tienen stock mayor a 0
        assert suggested["stock"] > 0


# Escenario: Repuesto sin complementarios
def test_part_without_complementary_returns_list_empty(client, db_session):
    # Dado un repuesto sin complementarios con stock: para las pastillas del
    # Cronos (Frenos -> Suspensión) solo hay un amortiguador sin stock.
    parts = make_catalog(db_session)

    # Cuando se solicitan recomendaciones para ese repuesto
    response = recommend(client, parts["pastillas_cronos"])

    # Entonces la API devuelve una lista vacía con código 200
    assert response.status_code == 200
    assert response.json() == {"parts": []}


# Escenario: Repuesto inexistente
def test_part_nonexistent_returns_404(client, db_session):
    make_catalog(db_session)

    # Cuando se solicitan recomendaciones para un repuesto que no existe
    response = client.get("/api/v1/recommendations", params={"part_ids": "999"})

    # Entonces la API responde con código 404
    assert response.status_code == 404
    assert "999" in response.json()["detail"]


# Casos adicionales de la regla y del contrato

def test_excludes_without_stock_others_vehicles_and_others_years(client, db_session):
    parts = make_catalog(db_session)

    # Encendido -> Filtros. Hay cinco filtros, pero solo dos sirven: quedan
    # afuera el que no tiene stock, el del Cronos y el del Onix 2021+. Como
    # son menos de 3, el tope no tapa ninguna exclusión.
    response = recommend(client, parts["bujia_onix"])

    assert [p["id"] for p in response.json()["parts"]] == [
        parts["filtro_onix"].id,
        parts["filtro_aire_onix"].id,
    ]


def test_prioritizes_categories_and_stops_in_three(client, db_session):
    parts = make_catalog(db_session)

    # Filtros -> Lubricantes primero, después Encendido. Hay 4 candidatos
    # (aceite, bujía, bobina y cables), así que los cables quedan afuera.
    response = recommend(client, parts["filtro_onix"])

    assert [p["id"] for p in response.json()["parts"]] == [
        parts["aceite"].id,
        parts["bujia_onix"].id,
        parts["bobina_onix"].id,
    ]


def test_keeps_the_structure_of_parts(client, db_session):
    parts = make_catalog(db_session)

    response = recommend(client, parts["bujia_onix"])

    assert response.json()["parts"][0] == {
        "id": parts["filtro_onix"].id,
        "name": "Filtro de aceite 1.4 SPE/4",
        "manufacturer": "Bosch",
        "compatible_brands": ["Chevrolet"],
        "compatible_models": ["Onix"],
        "year_from": 2013,
        "year_to": 2020,
        "engine_code": "1.4 SPE/4",
        "part_code": "FIL-0001",
        "category": "Filtros",
        "color": None,
        "price": 1000,
        "stock": 10,
        "description": None,
        "specifications": [],
        "warranty_months": None,
        "warranty_provider": None,
        "compatibilities": [
            {"brand": "Chevrolet", "model": "Onix", "engine_code": "1.4 SPE/4", "year_from": 2013, "year_to": 2020},
        ],
    }


def test_no_suggests_parts_of_the_cart_and_splits_between_them(client, db_session):
    parts = make_catalog(db_session)

    # Bujía (Encendido -> Filtros) y aceite (Lubricantes -> Filtros) del Onix:
    # los dos filtros son candidatos, pero el filtro de aceite ya está en el
    # carrito.
    response = recommend(client, parts["bujia_onix"], parts["aceite"], parts["filtro_onix"])

    ids = [p["id"] for p in response.json()["parts"]]
    assert parts["filtro_onix"].id not in ids
    assert parts["bujia_onix"].id not in ids
    assert parts["aceite"].id not in ids
    assert len(ids) == len(set(ids))
    assert parts["filtro_aire_onix"].id in ids


def test_splits_between_the_parts_of_the_cart_and_stops_in_three(client, db_session):
    parts = make_catalog(db_session)

    # El filtro tiene 3 candidatos (aceite, bobina y cables) y la bujía uno
    # (filtro de aire). Se toman por turnos, así la bujía también aporta.
    response = recommend(client, parts["filtro_onix"], parts["bujia_onix"])

    assert [p["id"] for p in response.json()["parts"]] == [
        parts["aceite"].id,
        parts["filtro_aire_onix"].id,
        parts["bobina_onix"].id,
    ]


def test_part_ids_is_required(client):
    response = client.get("/api/v1/recommendations")

    assert response.status_code == 422


def test_part_ids_invalid_return_422(client):
    for raw in ("abc", "1,x", " , ", "-1", "²", "１"):
        response = client.get("/api/v1/recommendations", params={"part_ids": raw})
        assert response.status_code == 422, raw


def test_category_without_complementary_returns_list_empty(client, db_session):
    parts = make_catalog(db_session)

    response = recommend(client, parts["llavero"])

    assert response.status_code == 200
    assert response.json() == {"parts": []}


def test_if_a_part_of_the_cart_no_exists_returns_404(client, db_session):
    parts = make_catalog(db_session)

    response = client.get(
        "/api/v1/recommendations", params={"part_ids": f"{parts['filtro_onix'].id},999"}
    )

    assert response.status_code == 404
    assert "999" in response.json()["detail"]


def test_ids_repeated_no_change_the_result(client, db_session):
    parts = make_catalog(db_session)
    filter_id = parts["filtro_onix"].id

    repeated = client.get("/api/v1/recommendations", params={"part_ids": f"{filter_id},{filter_id}"})
    simple = recommend(client, parts["filtro_onix"])

    assert repeated.status_code == 200
    assert repeated.json() == simple.json()


def test_id_out_of_range_returns_404(client, db_session):
    make_catalog(db_session)

    response = client.get(
        "/api/v1/recommendations", params={"part_ids": "9999999999"}
    )

    assert response.status_code == 404


def test_id_with_too_many_digits_returns_422(client):
    response = client.get("/api/v1/recommendations", params={"part_ids": "9" * 5000})

    assert response.status_code == 422


def test_too_many_part_ids_return_422(client):
    response = client.get(
        "/api/v1/recommendations",
        params={"part_ids": ",".join(str(i) for i in range(1, 52))},
    )

    assert response.status_code == 422
