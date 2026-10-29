"""Endpoints del dashboard del vendedor: evolución de ventas, proyección,
riesgo de agotamiento, detalle de un repuesto y filtros (HU 5.4 a 5.9).

El día se fija con la dependencia fecha_de_hoy. Las ventas van a mediodía
UTC de mediados de mes, lejos del cambio de mes en cualquier zona horaria.
"""

from datetime import date, datetime, timedelta, timezone

import jwt
import pytest

from backend.main import app
from app.api.v1.endpoints.analytics import fecha_de_hoy
from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import user as crud_user
from app.models.car_model import CarModel
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part

STOCK = "/api/v1/analytics/stock"
MAS_VENDIDOS = "/api/v1/analytics/best-sellers"
EVOLUCION = "/api/v1/analytics/sales-by-month"
PROYECCION = "/api/v1/analytics/demand-forecast"
RIESGO = "/api/v1/analytics/stockout-risk"
DETALLE = "/api/v1/analytics/parts"
VEHICULOS = "/api/v1/analytics/car-models"


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


def _hoy(dia):
    app.dependency_overrides[fecha_de_hoy] = lambda: dia


def _repuesto(db_session, codigo, stock, categoria="Frenos"):
    part = Part(
        part_code=codigo,
        name=f"Repuesto {codigo}",
        manufacturer="Bosch",
        category=categoria,
        price=1000,
        stock=stock,
    )
    db_session.add(part)
    db_session.commit()
    return part


def _venta(db_session, cliente, part, cantidad, anio, mes, estado=OrderStatus.DELIVERED):
    db_session.add(
        Order(
            client_id=cliente.user_id,
            created_at=datetime(anio, mes, 15, 12, tzinfo=timezone.utc),
            status=estado,
            ship_personal_name=cliente.name,
            ship_street="Av. Italia",
            ship_number="1234",
            ship_city="Montevideo",
            ship_department="Montevideo",
            payment_method_label="Visa •••• 1234",
            items=[OrderItem(part=part, quantity=cantidad, frozen_price=part.price)],
        )
    )
    db_session.commit()


def _ventas_mensuales(db_session, cliente, part, unidades, hasta=(2026, 3)):
    # Una venta por mes; el último elemento de `unidades` es el mes `hasta`.
    anio, mes = hasta
    for cantidad in reversed(unidades):
        if cantidad:
            _venta(db_session, cliente, part, cantidad, anio, mes)
        anio, mes = (anio, mes - 1) if mes > 1 else (anio - 1, 12)


@pytest.mark.parametrize("ruta", [EVOLUCION, PROYECCION, RIESGO, f"{DETALLE}/1", VEHICULOS])
def test_los_endpoints_del_dashboard_son_solo_para_vendedores(client, cliente, ruta):
    assert client.get(ruta).status_code == 401
    assert client.get(ruta, headers=_headers(cliente.user_id, "client")).status_code == 403


# --- Evolución de ventas (HU 5.4) ---


def test_evolucion_agrupa_unidades_y_facturacion_de_los_ultimos_12_meses(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    pastillas = _repuesto(db_session, "FRE-001", stock=10)
    _venta(db_session, cliente, pastillas, 2, 2026, 1)
    _venta(db_session, cliente, pastillas, 3, 2026, 1)
    _venta(db_session, cliente, pastillas, 4, 2026, 3)
    _venta(db_session, cliente, pastillas, 50, 2026, 2, estado=OrderStatus.CANCELLED)
    _venta(db_session, cliente, pastillas, 99, 2025, 3)  # hace 13 meses: afuera

    meses = client.get(EVOLUCION, headers=vendedor).json()["months"]

    assert [m["month"] for m in meses] == [f"2025-{m:02d}" for m in range(4, 13)] + ["2026-01", "2026-02", "2026-03"]
    assert [(m["units"], m["revenue"]) for m in meses[-3:]] == [(5, 5000), (0, 0), (4, 4000)]
    assert all(m["units"] == 0 for m in meses[:-3])
    assert [m["in_progress"] for m in meses] == [False] * 11 + [True]


def test_evolucion_permite_ver_el_aumento_entre_dos_meses(client, db_session, vendedor, cliente):
    # Escenario de la HU 5.4: un mes vendió más que el anterior.
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _venta(db_session, cliente, part, 10, 2026, 2)
    _venta(db_session, cliente, part, 25, 2026, 3)

    meses = client.get(EVOLUCION, params={"months": 2}, headers=vendedor).json()["months"]

    assert [(m["month"], m["units"]) for m in meses] == [("2026-02", 10), ("2026-03", 25)]


def test_evolucion_filtra_por_categoria_y_por_repuesto(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    pastillas = _repuesto(db_session, "FRE-001", stock=10, categoria="Frenos")
    discos = _repuesto(db_session, "FRE-002", stock=10, categoria="Frenos")
    filtro = _repuesto(db_session, "FIL-001", stock=10, categoria="Filtros")
    _venta(db_session, cliente, pastillas, 2, 2026, 3)
    _venta(db_session, cliente, discos, 3, 2026, 3)
    _venta(db_session, cliente, filtro, 7, 2026, 3)

    def unidades(**params):
        return client.get(EVOLUCION, params=params, headers=vendedor).json()["months"][-1]["units"]

    assert unidades() == 12
    assert unidades(category="frenos") == 5
    assert unidades(search="fil-0") == 7
    assert unidades(part_id=discos.id) == 3
    assert unidades(category="Filtros", search="FRE") == 0


def test_evolucion_incluye_la_proyeccion_del_mes_siguiente(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _ventas_mensuales(db_session, cliente, part, [10] * 12)

    body = client.get(EVOLUCION, params={"months": 3}, headers=vendedor).json()

    # Se muestran 3 meses, pero la recta se ajusta sobre 12.
    assert len(body["months"]) == 3
    assert body["projection"] == {"month": "2026-04", "units": 10}


def test_evolucion_rechaza_periodos_fuera_de_rango(client, vendedor):
    assert client.get(EVOLUCION, params={"months": 0}, headers=vendedor).status_code == 422
    assert client.get(EVOLUCION, params={"months": 25}, headers=vendedor).status_code == 422


# --- Proyección de demanda (HU 5.5) ---


def test_proyeccion_por_repuesto_de_mayor_a_menor(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    creciente = _repuesto(db_session, "FRE-001", stock=10)
    constante = _repuesto(db_session, "FRE-002", stock=10)
    _repuesto(db_session, "FRE-003", stock=10)  # nunca se vendió
    _ventas_mensuales(db_session, cliente, creciente, [10 * (i + 1) for i in range(12)])
    _ventas_mensuales(db_session, cliente, constante, [5] * 12)

    body = client.get(PROYECCION, headers=vendedor).json()

    assert body["month"] == "2026-04"
    assert [(p["part_code"], p["projected_units"], p["units_last_12_months"]) for p in body["parts"]] == [
        ("FRE-001", 130, 780),
        ("FRE-002", 5, 60),
        ("FRE-003", 0, 0),
    ]


def test_proyeccion_cuenta_el_mes_en_curso_a_mes_completo(client, db_session, vendedor, cliente):
    # El 15 de abril van 15 de 30 días: 5 unidades son 10 a mes completo.
    _hoy(date(2026, 4, 15))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _ventas_mensuales(db_session, cliente, part, [10] * 11 + [5], hasta=(2026, 4))

    body = client.get(PROYECCION, headers=vendedor).json()

    assert body["month"] == "2026-05"
    assert body["parts"][0]["projected_units"] == 10


def test_proyeccion_nunca_negativa_en_el_endpoint(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _ventas_mensuales(db_session, cliente, part, [120, 100, 80, 60, 40, 20, 0, 0, 0, 0, 0, 0])

    assert client.get(PROYECCION, headers=vendedor).json()["parts"][0]["projected_units"] == 0


def test_proyeccion_filtra_y_limita(client, db_session, vendedor):
    _hoy(date(2026, 3, 31))
    _repuesto(db_session, "FRE-001", stock=10, categoria="Frenos")
    _repuesto(db_session, "FRE-002", stock=10, categoria="Frenos")
    _repuesto(db_session, "FIL-001", stock=10, categoria="Filtros")

    frenos = client.get(PROYECCION, params={"category": "Frenos"}, headers=vendedor).json()["parts"]
    uno = client.get(PROYECCION, params={"limit": 1}, headers=vendedor).json()["parts"]

    assert [p["part_code"] for p in frenos] == ["FRE-001", "FRE-002"]
    assert len(uno) == 1


def test_los_calculos_no_cambian_las_ventas_ni_el_stock(client, db_session, vendedor, cliente):
    # Escenario de la HU 5.5: datos reales intactos.
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _ventas_mensuales(db_session, cliente, part, [30] * 12)

    def ventas():
        return sorted((i.order_id, i.part_id, i.quantity, i.frozen_price) for i in db_session.query(OrderItem))

    antes = ventas()
    for ruta in (EVOLUCION, PROYECCION, RIESGO, f"{DETALLE}/{part.id}"):
        assert client.get(ruta, headers=vendedor).status_code == 200

    db_session.expire_all()
    assert db_session.get(Part, part.id).stock == 10
    assert ventas() == antes


# --- Riesgo de agotamiento y alertas (HU 5.6 y 5.7) ---


def test_riesgo_de_agotamiento_del_mas_urgente_al_menos_urgente(client, db_session, vendedor, cliente):
    # Abril tiene 30 días: 30 unidades proyectadas son 1 por día.
    _hoy(date(2026, 3, 31))
    alto = _repuesto(db_session, "FRE-001", stock=10)  # 10 días
    medio = _repuesto(db_session, "FRE-002", stock=20)  # 20 días
    bajo = _repuesto(db_session, "FRE-003", stock=100)  # 100 días
    agotado = _repuesto(db_session, "FRE-004", stock=0)  # 0 días
    _repuesto(db_session, "FRE-005", stock=0)  # sin demanda
    for part in (alto, medio, bajo, agotado):
        _ventas_mensuales(db_session, cliente, part, [30] * 12)

    body = client.get(RIESGO, headers=vendedor).json()

    assert body["month"] == "2026-04"
    assert body["thresholds"] == {"high_below": 15, "medium_up_to": 30}
    assert [(p["part_code"], p["coverage_days"], p["risk"]) for p in body["parts"]] == [
        ("FRE-004", 0, "high"),
        ("FRE-001", 10, "high"),
        ("FRE-002", 20, "medium"),
        ("FRE-003", 100, "low"),
        ("FRE-005", None, "low"),
    ]
    assert body["parts"][1]["projected_units"] == 30
    assert body["parts"][1]["daily_demand"] == 1


def test_dentro_de_un_nivel_primero_el_que_deja_mas_demanda_sin_cubrir(client, db_session, vendedor, cliente):
    # Los dos tienen riesgo alto. El agotado casi no se vende (falta 1
    # unidad); al otro le quedan 10 días pero le faltan 60 para el mes.
    _hoy(date(2026, 3, 31))
    agotado_lento = _repuesto(db_session, "FRE-001", stock=0)
    estrella = _repuesto(db_session, "FRE-002", stock=30)
    _ventas_mensuales(db_session, cliente, agotado_lento, [1] * 12)
    _ventas_mensuales(db_session, cliente, estrella, [90] * 12)

    partes = client.get(RIESGO, params={"at_risk_only": True}, headers=vendedor).json()["parts"]

    assert [(p["part_code"], p["risk"]) for p in partes] == [("FRE-002", "high"), ("FRE-001", "high")]


def test_alertas_de_reposicion_solo_riesgo_alto_o_medio(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    alto = _repuesto(db_session, "FRE-001", stock=10)
    bajo = _repuesto(db_session, "FRE-002", stock=100)
    _ventas_mensuales(db_session, cliente, alto, [30] * 12)
    _ventas_mensuales(db_session, cliente, bajo, [30] * 12)

    body = client.get(RIESGO, params={"at_risk_only": True}, headers=vendedor).json()

    assert [p["part_code"] for p in body["parts"]] == ["FRE-001"]


def test_sin_repuestos_en_riesgo_la_lista_de_alertas_esta_vacia(client, db_session, vendedor):
    _hoy(date(2026, 3, 31))
    _repuesto(db_session, "FRE-001", stock=100)

    assert client.get(RIESGO, params={"at_risk_only": True}, headers=vendedor).json()["parts"] == []


def test_riesgo_filtra_por_categoria(client, db_session, vendedor):
    _hoy(date(2026, 3, 31))
    _repuesto(db_session, "FRE-001", stock=1, categoria="Frenos")
    _repuesto(db_session, "FIL-001", stock=1, categoria="Filtros")

    body = client.get(RIESGO, params={"category": "Filtros"}, headers=vendedor).json()

    assert [p["part_code"] for p in body["parts"]] == ["FIL-001"]


# --- Detalle de un repuesto (HU 5.8) ---


def test_detalle_de_un_repuesto(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=10)
    _ventas_mensuales(db_session, cliente, part, [30] * 12)
    _venta(db_session, cliente, part, 7, 2024, 6)  # vieja: cuenta en el total

    body = client.get(f"{DETALLE}/{part.id}", headers=vendedor).json()

    assert body["part_code"] == "FRE-001"
    assert body["name"] == "Repuesto FRE-001"
    assert body["stock"] == 10
    assert body["price"] == 1000
    assert body["low_stock"] is False
    assert body["units_sold"] == 367
    assert len(body["months"]) == 12
    assert body["months"][-1] == {"month": "2026-03", "units": 30, "revenue": 30000, "in_progress": True}
    assert body["projection"] == {"month": "2026-04", "units": 30}
    assert body["coverage_days"] == 10
    assert body["risk"] == "high"


def test_detalle_de_un_repuesto_que_nunca_se_vendio(client, db_session, vendedor):
    _hoy(date(2026, 3, 31))
    part = _repuesto(db_session, "FRE-001", stock=4)

    body = client.get(f"{DETALLE}/{part.id}", headers=vendedor).json()

    assert body["units_sold"] == 0
    assert body["stock"] == 4
    assert body["low_stock"] is True
    assert all(m["units"] == 0 for m in body["months"])
    assert body["projection"]["units"] == 0
    assert body["coverage_days"] is None
    assert body["risk"] == "low"


def test_detalle_de_un_repuesto_que_no_existe(client, vendedor):
    response = client.get(f"{DETALLE}/9999", headers=vendedor)

    assert response.status_code == 404
    assert response.json()["detail"] == "Repuesto no encontrado."


# --- Filtros en stock y más vendidos (HU 5.9) ---


def test_stock_filtra_por_categoria_y_por_repuesto(client, db_session, vendedor):
    _repuesto(db_session, "FRE-001", stock=1, categoria="Frenos")
    _repuesto(db_session, "FIL-001", stock=2, categoria="Filtros")

    def codigos(**params):
        return [p["part_code"] for p in client.get(STOCK, params=params, headers=vendedor).json()["parts"]]

    assert codigos() == ["FRE-001", "FIL-001"]
    assert codigos(category="Filtros") == ["FIL-001"]
    assert codigos(search="fre") == ["FRE-001"]
    # Quitar filtros: vacíos es lo mismo que no mandarlos.
    assert codigos(category="", search="") == ["FRE-001", "FIL-001"]


def test_mas_vendidos_por_meses_calendario_y_categoria(client, db_session, vendedor, cliente):
    _hoy(date(2026, 3, 31))
    pastillas = _repuesto(db_session, "FRE-001", stock=10, categoria="Frenos")
    filtro = _repuesto(db_session, "FIL-001", stock=10, categoria="Filtros")
    _venta(db_session, cliente, pastillas, 5, 2026, 3)
    _venta(db_session, cliente, pastillas, 100, 2025, 10)  # hace 6 meses
    _venta(db_session, cliente, filtro, 8, 2026, 2)

    def ranking(**params):
        body = client.get(MAS_VENDIDOS, params=params, headers=vendedor).json()
        return [(p["part_code"], p["units_sold"]) for p in body["parts"]]

    assert ranking(months=3) == [("FIL-001", 8), ("FRE-001", 5)]
    assert ranking(months=6) == [("FRE-001", 105), ("FIL-001", 8)]
    assert ranking(months=3, category="Frenos") == [("FRE-001", 5)]
    assert ranking(search="FIL") == [("FIL-001", 8)]


# --- Vehículos para el formulario de repuestos (HU 5.10) ---


def test_vehiculos_para_el_formulario(client, db_session, vendedor):
    db_session.add_all([
        CarModel(brand="Volkswagen", model="Gol", engine_code="1.6"),
        CarModel(brand="Chevrolet", model="Onix", engine_code="1.4 8V"),
    ])
    db_session.commit()

    body = client.get(VEHICULOS, headers=vendedor).json()

    assert [(m["brand"], m["model"], m["engine_code"]) for m in body["car_models"]] == [
        ("Chevrolet", "Onix", "1.4 8V"),
        ("Volkswagen", "Gol", "1.6"),
    ]
