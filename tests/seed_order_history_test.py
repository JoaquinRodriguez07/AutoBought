import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.order import Order, OrderStatus
from app.models.part import Part
from scripts.seed_order_history import MESES, generar_historial

HASTA = date(2026, 10, 19)
PARTS_JSON = Path(__file__).resolve().parents[1] / "backend" / "data" / "parts.json"


def _base_con_catalogo():
    """Base SQLite en memoria, nueva, con el catálogo real cargado."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    for p in json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"]:
        db.add(Part(part_code=p["part_code"], name=p["name"], category=p["category"],
                    color=p["color"], price=p["price"], stock=p["stock"]))
    db.commit()
    return db


def _pedidos(db):
    """Los pedidos, comparables entre dos bases (sin ids)."""
    return [
        (
            o.client.email,
            o.created_at.replace(tzinfo=None),
            o.status,
            o.ship_street,
            o.payment_method_label,
            sorted((i.part.part_code, i.quantity, i.frozen_price) for i in o.items),
        )
        for o in db.scalars(select(Order).order_by(Order.created_at, Order.order_id))
    ]


def _stock(db):
    return {p.part_code: p.stock for p in db.scalars(select(Part))}


@pytest.fixture(scope="module")
def generada():
    db = _base_con_catalogo()
    stock_antes = _stock(db)
    resumen = generar_historial(db, semilla=2026, hasta=HASTA)
    yield db, resumen, stock_antes
    db.close()


def _unidades_por_mes(db, categoria, nombre=""):
    unidades = Counter()
    for o in db.scalars(select(Order)):
        for i in o.items:
            if i.part.category == categoria and i.part.name.startswith(nombre):
                unidades[o.created_at.month] += i.quantity
    return unidades


# ---------------------------------------------------------------- criterios

def test_la_misma_semilla_genera_los_mismos_pedidos():
    primera, segunda = _base_con_catalogo(), _base_con_catalogo()

    generar_historial(primera, semilla=7, hasta=HASTA)
    generar_historial(segunda, semilla=7, hasta=HASTA)

    assert _pedidos(primera) == _pedidos(segunda)
    assert len(_pedidos(primera)) > 0


def test_otra_semilla_genera_otros_pedidos():
    primera, segunda = _base_con_catalogo(), _base_con_catalogo()

    generar_historial(primera, semilla=1, hasta=HASTA)
    generar_historial(segunda, semilla=2, hasta=HASTA)

    assert _pedidos(primera) != _pedidos(segunda)


def test_el_stock_no_cambia(generada):
    db, _, stock_antes = generada

    assert _stock(db) == stock_antes


def test_hay_pedidos_en_cada_uno_de_los_ultimos_12_meses(generada):
    db, resumen, _ = generada
    fechas = [o.created_at.date() for o in db.scalars(select(Order))]

    assert len(fechas) == resumen.pedidos
    assert min(fechas) >= date(HASTA.year - 1, HASTA.month + 1, 1)
    assert max(fechas) <= HASTA
    assert len({(f.year, f.month) for f in fechas}) == MESES


def test_correrlo_dos_veces_no_duplica(generada):
    db, resumen, _ = generada

    segunda = generar_historial(db, semilla=2026, hasta=HASTA)

    assert segunda.salteado
    assert db.query(Order).count() == resumen.pedidos


def test_sin_catalogo_avisa_que_hay_que_cargarlo():
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)

    with pytest.raises(RuntimeError, match="scripts.seed"):
        generar_historial(sessionmaker(bind=engine)(), hasta=HASTA)


# ---------------------------------------------------------------- forma de los datos

def test_las_ventas_crecen_a_lo_largo_del_anio(generada):
    db, _, _ = generada
    por_mes = Counter((o.created_at.year, o.created_at.month) for o in db.scalars(select(Order)))
    meses = sorted(por_mes)

    # Se comparan meses completos y sin estacionalidad fuerte: noviembre vs. septiembre.
    assert por_mes[meses[-2]] > 1.4 * por_mes[meses[0]]


def test_estacionalidad_por_epoca_del_anio(generada):
    db, _, _ = generada
    invierno, verano, primavera = (6, 7, 8), (12, 1, 2), (9, 10, 11)

    def total(unidades, meses):
        return sum(unidades[m] for m in meses)

    baterias = _unidades_por_mes(db, "Eléctrico")
    encendido = _unidades_por_mes(db, "Encendido")
    refrigeracion = _unidades_por_mes(db, "Refrigeración")
    habitaculo = _unidades_por_mes(db, "Filtros", nombre="Filtro de habitáculo")

    assert total(baterias, invierno) > 2 * total(baterias, verano)
    assert total(encendido, invierno) > 2 * total(encendido, verano)
    assert total(refrigeracion, verano) > 2 * total(refrigeracion, invierno)
    # Menos margen: octubre va incompleto y el invierno cae más tarde en el
    # año, con la tendencia ya más alta.
    assert total(habitaculo, primavera) > 1.5 * total(habitaculo, invierno)


def test_pocos_repuestos_estrella_y_muchos_lentos(generada):
    db, _, _ = generada
    unidades = Counter()
    for o in db.scalars(select(Order)):
        for i in o.items:
            unidades[i.part_id] += i.quantity
    ventas = sorted(unidades.values(), reverse=True)
    total_repuestos = db.query(Part).count()

    top_10_por_ciento = sum(ventas[: total_repuestos // 10])
    assert top_10_por_ciento > 0.4 * sum(ventas)
    assert sorted(ventas)[len(ventas) // 2] < ventas[0] / 20


def test_hay_repuestos_en_riesgo_con_stock_bajo_y_ventas_altas(generada):
    db, resumen, _ = generada
    desde = HASTA - timedelta(days=30)
    ultimos_30_dias = Counter()
    for o in db.scalars(select(Order)):
        if o.created_at.date() > desde and o.status != OrderStatus.CANCELLED:
            for i in o.items:
                ultimos_30_dias[i.part.part_code] += i.quantity
    stock = _stock(db)

    assert len(resumen.en_riesgo) == 8
    # Venden en un mes más de lo que tienen en stock.
    assert all(ultimos_30_dias[codigo] > stock[codigo] for codigo in resumen.en_riesgo)


def test_cada_auto_del_catalogo_tiene_una_bateria():
    parts = json.loads(PARTS_JSON.read_text(encoding="utf-8"))["parts"]
    modelos = json.loads((PARTS_JSON.parent / "car_models.json").read_text(encoding="utf-8"))["car_models"]
    baterias = Counter(
        (c["brand"], c["model"], c["engine_code"])
        for p in parts if p["category"] == "Eléctrico"
        for c in p["compatibilities"]
    )

    assert all(baterias[(m["brand"], m["model"], m["engine_code"])] == 1 for m in modelos)
