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
        "fuel": None,
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
        "fuel": None,
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

def test_rechaza_busquedas_demasiado_largas(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "a" * 101})

    assert response.status_code == 422


def test_encuentra_la_pieza_en_busquedas_largas(client, db_session):
    make_catalog(db_session)

    response = client.get(
        "/api/v1/parts",
        params={
            "q": "necesito buscar repuestos nuevos para mi auto por favor "
                 "ahora pastillas de freno onix 2020"
        },
    )

    assert response.json()["entities"]["part"] == "pastillas de freno"
    codes = [p["part_code"] for p in response.json()["parts"]]
    assert codes == ["BRK-0001"]

# --- HU 4.3: sinónimos, errores de tipeo y orden de palabras ---------------

ENTIDADES_FRENOS_ONIX = {
    "part": "pastillas de freno",
    "brand": "Chevrolet",
    "model": "Onix",
    "year": 2020,
    "fuel": None,
}


def test_error_de_tipeo(client, db_session):
    make_catalog(db_session)

    normal = client.get(
        "/api/v1/parts", params={"q": "pastillas de freno onix 2020"}
    ).json()
    con_error = client.get(
        "/api/v1/parts", params={"q": "pastiyas de freno onix 2020"}
    ).json()

    assert con_error["entities"] == ENTIDADES_FRENOS_ONIX
    assert [p["id"] for p in con_error["parts"]] == [p["id"] for p in normal["parts"]]
    assert [p["part_code"] for p in con_error["parts"]] == ["BRK-0001"]


def test_sinonimo(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "balatas onix 2020"})

    assert response.json()["entities"] == ENTIDADES_FRENOS_ONIX
    assert [p["part_code"] for p in response.json()["parts"]] == ["BRK-0001"]


def test_otro_orden(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "freno pastillas onix 2020"})

    assert response.json()["entities"] == ENTIDADES_FRENOS_ONIX
    assert [p["part_code"] for p in response.json()["parts"]] == ["BRK-0001"]


def test_sinonimo_con_error_de_tipeo_y_otro_orden(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "frenno pastilas onix 2020"})

    assert response.json()["entities"] == ENTIDADES_FRENOS_ONIX


def test_una_sola_palabra_no_se_confunde_con_otra_pieza(client, db_session):
    make_catalog(db_session)

    response = client.get("/api/v1/parts", params={"q": "filtro onix 2020"})

    assert response.json()["entities"]["part"] == "filtro"
    assert [p["part_code"] for p in response.json()["parts"]] == ["FIL-0001"]


# --- Más sinónimos y combustible --------------------------------------------

def make_catalog_combustible(db_session):
    hilux = CarModel(brand="Toyota", model="Hilux", engine_code="2.8 1GD")
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.0 Turbo")

    filtro_diesel = Part(part_code="FIL-D", name="Filtro de combustible Hilux",
                         category="Filtros", price=900, stock=5)
    filtro_nafta = Part(part_code="FIL-N", name="Filtro de combustible Onix",
                        category="Filtros", price=900, stock=5)
    bateria = Part(part_code="BAT-1", name="Batería 60Ah",
                   category="Eléctrico", price=5000, stock=5)
    filtro_diesel.compatibilities = [Compatibility(car_model=hilux, year_from=2016, year_to=2024)]
    filtro_nafta.compatibilities = [Compatibility(car_model=onix, year_from=2020, year_to=2024)]
    bateria.compatibilities = [
        Compatibility(car_model=hilux, year_from=2016, year_to=2024),
        Compatibility(car_model=onix, year_from=2020, year_to=2024),
    ]
    db_session.add_all([filtro_diesel, filtro_nafta, bateria])
    db_session.commit()


def codigos(client, q):
    response = client.get("/api/v1/parts", params={"q": q})
    return response.json()["entities"], [p["part_code"] for p in response.json()["parts"]]


def test_gasolero_trae_solo_autos_diesel(client, db_session):
    make_catalog_combustible(db_session)

    entities, parts = codigos(client, "batería gasolero")

    assert entities["fuel"] == "diesel"
    assert entities["part"] == "batería"
    assert parts == ["BAT-1"]
    assert codigos(client, "filtro de combustible gasolero")[1] == ["FIL-D"]


def test_naftero_trae_solo_autos_nafta(client, db_session):
    make_catalog_combustible(db_session)

    entities, parts = codigos(client, "filtro de combustible naftero")

    assert entities["fuel"] == "nafta"
    assert parts == ["FIL-N"]


def test_combustible_con_sinonimos_y_errores(client, db_session):
    make_catalog_combustible(db_session)

    # "gasoil", "diésel" y un tipeo ("gasolro") son lo mismo que "gasolero".
    for texto in ("filtro de gasoil", "filtro diésel", "filtro combustible gasolro"):
        assert codigos(client, texto)[1] == ["FIL-D"], texto
    # "nafta"/"gasolina" también filtran por motor.
    assert codigos(client, "filtro combustible gasolina")[1] == ["FIL-N"]


def test_combustible_solo_filtra_por_motor(client, db_session):
    make_catalog_combustible(db_session)

    entities, parts = codigos(client, "gasolero")

    assert entities == {"part": None, "brand": None, "model": None, "year": None, "fuel": "diesel"}
    assert sorted(parts) == ["BAT-1", "FIL-D"]


def test_sinonimos_del_rubro(client, db_session):
    make_catalog_combustible(db_session)

    casos = {
        "acumulador": "batería",
        "bateria": "batería",
        "acumulador gasolero": "batería",
        "filtro de nafta": "filtro de combustible",
    }
    for texto, pieza in casos.items():
        assert codigos(client, texto)[0]["part"] == pieza, texto


def test_diccionario_sin_claves_repetidas_ni_ciclos():
    from app.crud.text_search import FUEL_WORDS, SYNONYMS, _fold

    claves = [_fold(k) for k in SYNONYMS]
    assert len(claves) == len(set(claves))
    assert all(k == _fold(k) and k == k.lower() for k in SYNONYMS)
    # Ninguna clave puede ser una palabra de combustible: se pisarían.
    assert not set(claves) & set(FUEL_WORDS)
