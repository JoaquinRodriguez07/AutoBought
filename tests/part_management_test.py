"""Alta, edición y ajuste de stock de repuestos desde el dashboard (HU 5.10)."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.car_model import CarModel
from app.models.compatibility import Compatibility
from app.models.favorite import Favorite
from app.models.part import Part
from app.models.stock_alert import StockAlert

PARTS = "/api/v1/parts"


def _headers(user_id, user_type):
    payload = {
        "sub": str(user_id),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return {"Authorization": f"Bearer {jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)}"}


@pytest.fixture
def vendedor(db_session):
    employee = crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )
    return _headers(employee.user_id, "employee")


@pytest.fixture
def cliente(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


@pytest.fixture
def vehiculos(db_session):
    gol = CarModel(brand="Volkswagen", model="Gol", engine_code="1.6")
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.4 8V")
    db_session.add_all([gol, onix])
    db_session.commit()
    return gol, onix


def _repuesto(db_session, car_model, stock=38, price=2500, codigo="FRE-001"):
    part = Part(part_code=codigo, name="Pastillas de freno", manufacturer="Bosch", category="Frenos", price=price, stock=stock)
    part.compatibilities = [Compatibility(car_model_id=car_model.id, year_from=2010, year_to=2020)]
    db_session.add(part)
    db_session.commit()
    return part


def _datos(car_model_ids, **cambios):
    datos = {
        "part_code": "FRE-100",
        "name": "Discos de freno",
        "manufacturer": "Fremax",
        "category": "Frenos",
        "price": 4200,
        "stock": 12,
        "description": "Par de discos ventilados.",
        "compatibilities": [{"car_model_id": i, "year_from": 2015, "year_to": 2022} for i in car_model_ids],
    }
    return {**datos, **cambios}


# --- Ajustar stock ---


def test_ajustar_stock(client, db_session, vendedor, vehiculos):
    # Escenario de la HU: de 38 a 50 unidades.
    part = _repuesto(db_session, vehiculos[0], stock=38)

    response = client.patch(f"{PARTS}/{part.id}/stock", json={"stock": 50}, headers=vendedor)

    assert response.status_code == 200
    assert response.json()["stock"] == 50
    assert client.get(f"{PARTS}/{part.id}").json()["stock"] == 50
    assert [p["stock"] for p in client.get(PARTS).json()["parts"]] == [50]


def test_ajustar_stock_rechaza_negativos(client, db_session, vendedor, vehiculos):
    part = _repuesto(db_session, vehiculos[0])

    assert client.patch(f"{PARTS}/{part.id}/stock", json={"stock": -1}, headers=vendedor).status_code == 422


def test_ajustar_stock_de_un_repuesto_que_no_existe(client, vendedor):
    response = client.patch(f"{PARTS}/9999/stock", json={"stock": 5}, headers=vendedor)

    assert response.status_code == 404
    assert response.json()["detail"] == "Repuesto no encontrado."


def test_reponer_un_agotado_avisa_a_quienes_lo_esperaban(client, db_session, vendedor, cliente, vehiculos, mails):
    part = _repuesto(db_session, vehiculos[0], stock=0)
    db_session.add(StockAlert(client_id=cliente.user_id, part_id=part.id))
    db_session.commit()

    client.patch(f"{PARTS}/{part.id}/stock", json={"stock": 10}, headers=vendedor)

    assert [m["To"] for m in mails] == ["ana@example.com"]
    assert db_session.query(StockAlert).count() == 0


# --- Alta de repuesto ---


def test_alta_de_repuesto(client, db_session, vendedor, vehiculos):
    gol, onix = vehiculos

    response = client.post(PARTS, json=_datos([gol.id, onix.id]), headers=vendedor)

    assert response.status_code == 201
    creado = response.json()
    assert (creado["part_code"], creado["name"], creado["price"], creado["stock"]) == ("FRE-100", "Discos de freno", 4200, 12)
    assert sorted(creado["compatible_models"]) == ["Gol", "Onix"]

    # Aparece en el catálogo y en los filtros por vehículo.
    assert [p["part_code"] for p in client.get(PARTS).json()["parts"]] == ["FRE-100"]
    del_gol = client.get(PARTS, params={"brand": "Volkswagen", "model": "Gol", "year": 2018}).json()["parts"]
    fuera_de_rango = client.get(PARTS, params={"brand": "Volkswagen", "model": "Gol", "year": 2010}).json()["parts"]
    assert [p["part_code"] for p in del_gol] == ["FRE-100"]
    assert fuera_de_rango == []


def test_alta_limpia_los_espacios(client, vendedor, vehiculos):
    response = client.post(PARTS, json=_datos([vehiculos[0].id], name="  Discos de freno  "), headers=vendedor)

    assert response.json()["name"] == "Discos de freno"


def test_alta_con_un_codigo_que_ya_existe(client, db_session, vendedor, vehiculos):
    _repuesto(db_session, vehiculos[0], codigo="FRE-100")

    response = client.post(PARTS, json=_datos([vehiculos[0].id], part_code="fre-100"), headers=vendedor)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ya existe un repuesto con ese código."


@pytest.mark.parametrize(
    "cambios",
    [
        {"compatibilities": []},
        {"compatibilities": [{"car_model_id": 1, "year_from": 2020, "year_to": 2015}]},
        {"compatibilities": [{"car_model_id": 1, "year_from": 2015, "year_to": 2020}] * 2},
        {"price": 0},
        {"stock": -3},
        {"name": "   "},
        {"part_code": ""},
    ],
)
def test_alta_con_datos_invalidos(client, vendedor, vehiculos, cambios):
    response = client.post(PARTS, json=_datos([vehiculos[0].id], **cambios), headers=vendedor)

    assert response.status_code == 422


def test_alta_con_un_vehiculo_que_no_existe(client, vendedor, vehiculos):
    response = client.post(PARTS, json=_datos([vehiculos[0].id, 9999]), headers=vendedor)

    assert response.status_code == 422
    assert response.json()["detail"] == "Alguno de los vehículos compatibles no existe."


# --- Edición ---


def test_editar_reemplaza_los_datos_y_los_vehiculos_sin_tocar_el_stock(client, db_session, vendedor, vehiculos):
    gol, onix = vehiculos
    part = _repuesto(db_session, gol, stock=38)

    response = client.put(
        f"{PARTS}/{part.id}",
        json=_datos([onix.id], part_code="FRE-001", name="Pastillas cerámicas", stock=999),
        headers=vendedor,
    )

    assert response.status_code == 200
    editado = response.json()
    assert editado["name"] == "Pastillas cerámicas"
    assert editado["stock"] == 38
    assert editado["compatible_models"] == ["Onix"]
    assert client.get(PARTS, params={"brand": "Volkswagen", "model": "Gol"}).json()["parts"] == []


def test_editar_con_el_codigo_de_otro_repuesto(client, db_session, vendedor, vehiculos):
    _repuesto(db_session, vehiculos[0], codigo="FRE-001")
    otro = _repuesto(db_session, vehiculos[0], codigo="FRE-002")

    response = client.put(f"{PARTS}/{otro.id}", json=_datos([vehiculos[0].id], part_code="FRE-001"), headers=vendedor)

    assert response.status_code == 409


def test_editar_un_repuesto_que_no_existe(client, vendedor, vehiculos):
    assert client.put(f"{PARTS}/9999", json=_datos([vehiculos[0].id]), headers=vendedor).status_code == 404


def test_bajar_el_precio_avisa_a_quienes_lo_tienen_en_favoritos(client, db_session, vendedor, cliente, vehiculos, mails):
    part = _repuesto(db_session, vehiculos[0], price=2500)
    cliente.marketing_emails = True
    db_session.add(Favorite(client_id=cliente.user_id, part_id=part.id))
    db_session.commit()

    client.put(f"{PARTS}/{part.id}", json=_datos([vehiculos[0].id], part_code="FRE-001", price=2000), headers=vendedor)

    assert [m["To"] for m in mails] == ["ana@example.com"]


# --- Permisos ---


def test_cliente_sin_permiso(client, db_session, cliente, vehiculos):
    # Escenario de la HU: un cliente intenta modificar un repuesto.
    part = _repuesto(db_session, vehiculos[0], stock=38)
    headers = _headers(cliente.user_id, "client")

    assert client.patch(f"{PARTS}/{part.id}/stock", json={"stock": 50}, headers=headers).status_code == 403
    assert client.put(f"{PARTS}/{part.id}", json=_datos([vehiculos[0].id]), headers=headers).status_code == 403
    assert client.post(PARTS, json=_datos([vehiculos[0].id]), headers=headers).status_code == 403

    db_session.expire_all()
    assert db_session.get(Part, part.id).stock == 38
    assert db_session.query(Part).count() == 1


def test_sin_sesion_no_se_modifica_nada(client, db_session, vehiculos):
    part = _repuesto(db_session, vehiculos[0])

    assert client.patch(f"{PARTS}/{part.id}/stock", json={"stock": 50}).status_code == 401
    assert client.post(PARTS, json=_datos([vehiculos[0].id])).status_code == 401
