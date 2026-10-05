from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.part import Part


def make_part(db_session, code, name, category, stock, *compatibilities):
    part = Part(part_code=code, name=name, category=category, price=1000, stock=stock)
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
        "aceite": make_part(db_session, "LUB-0001", "Aceite de motor 5W30 4L",
                            "Lubricantes", 20, (onix, 2013, 2020), (cronos, 2018, 2024)),
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
        "pastillas_cronos": make_part(db_session, "BRK-0001", "Pastillas de freno Fiat Cronos",
                                      "Frenos", 5, (cronos, 2018, 2024)),
        "escobilla": make_part(db_session, "ACC-0001", "Escobilla limpiaparabrisas",
                               "Accesorios", 5, (onix, 2013, 2020), (cronos, 2018, 2024)),
    }
    db_session.commit()
    return parts


def recommend(client, *parts):
    return client.get(
        "/api/v1/recommendations",
        params={"part_ids": ",".join(str(part.id) for part in parts)},
    )


def test_sugerencias_para_un_repuesto_del_carrito(client, db_session):
    parts = make_catalog(db_session)
    filtro = parts["filtro_onix"]

    response = recommend(client, filtro)

    assert response.status_code == 200
    sugeridos = response.json()["parts"]
    assert 1 <= len(sugeridos) <= 3
    for sugerido in sugeridos:
        assert "Onix" in sugerido["compatible_models"]
        assert sugerido["year_from"] <= 2015 <= sugerido["year_to"]
        assert sugerido["id"] != filtro.id
        assert sugerido["stock"] > 0


def test_prioriza_categorias_y_excluye_sin_stock_otros_vehiculos_y_otros_anios(client, db_session):
    parts = make_catalog(db_session)

    response = recommend(client, parts["filtro_onix"])

    # Filtros -> Lubricantes primero, después Encendido. Quedan afuera la
    # bujía sin stock, la de Cronos y la del Onix 2021+, y el otro filtro
    # (misma categoría, no complementaria).
    assert [p["id"] for p in response.json()["parts"]] == [
        parts["aceite"].id,
        parts["bujia_onix"].id,
        parts["bobina_onix"].id,
    ]


def test_mantiene_la_estructura_de_parts(client, db_session):
    parts = make_catalog(db_session)

    response = recommend(client, parts["bujia_onix"])

    assert response.json()["parts"][0] == {
        "id": parts["filtro_onix"].id,
        "name": "Filtro de aceite 1.4 SPE/4",
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
    }


def test_no_sugiere_repuestos_del_carrito_y_reparte_entre_ellos(client, db_session):
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


def test_devuelve_como_maximo_tres(client, db_session):
    parts = make_catalog(db_session)

    response = recommend(client, parts["filtro_onix"], parts["bujia_onix"])

    assert len(response.json()["parts"]) == 3


def test_repuesto_sin_complementarios_devuelve_lista_vacia(client, db_session):
    parts = make_catalog(db_session)

    # Frenos -> Suspensión, y no hay amortiguadores cargados.
    response = recommend(client, parts["pastillas_cronos"])

    assert response.status_code == 200
    assert response.json() == {"parts": []}


def test_repuesto_inexistente_devuelve_404(client, db_session):
    parts = make_catalog(db_session)

    response = client.get(
        "/api/v1/recommendations", params={"part_ids": f"{parts['filtro_onix'].id},999"}
    )

    assert response.status_code == 404
    assert "999" in response.json()["detail"]


def test_part_ids_es_obligatorio(client):
    response = client.get("/api/v1/recommendations")

    assert response.status_code == 422


def test_part_ids_invalidos_devuelven_422(client):
    for raw in ("abc", "1,x", " , ", "-1"):
        response = client.get("/api/v1/recommendations", params={"part_ids": raw})
        assert response.status_code == 422, raw
