"""Cálculos del dashboard del vendedor (app/core/analitica.py), con datos
chicos y conocidos: agrupado por mes (HU 5.4), proyección (HU 5.5) y
riesgo de agotamiento (HU 5.6)."""

from datetime import date, datetime, timezone

import numpy as np
import pytest

from app.core import analitica
from app.core.analitica import URUGUAY


# --- Meses ---


def test_ultimos_meses_incluye_el_actual_y_cruza_el_anio():
    assert analitica.ultimos_meses(date(2026, 2, 10), 4) == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]


def test_mes_siguiente_de_diciembre_es_enero():
    assert analitica.mes_siguiente((2026, 12)) == (2027, 1)
    assert analitica.mes_siguiente((2026, 3)) == (2026, 4)


# --- Agrupado por mes (HU 5.4) ---

MESES = [(2026, 1), (2026, 2), (2026, 3)]


def _venta(anio, mes, dia, unidades, precio=100, hora=12, zona=URUGUAY):
    return datetime(anio, mes, dia, hora, tzinfo=zona), unidades, unidades * precio


def test_agrupa_unidades_y_facturacion_por_mes():
    ventas = [
        _venta(2026, 1, 5, 2),
        _venta(2026, 1, 20, 3, precio=200),
        _venta(2026, 3, 1, 4),
    ]

    assert analitica.agrupar_por_mes(ventas, MESES) == [
        {"month": "2026-01", "units": 5, "revenue": 800},
        {"month": "2026-02", "units": 0, "revenue": 0},
        {"month": "2026-03", "units": 4, "revenue": 400},
    ]


def test_un_mes_sin_ventas_vale_cero_y_las_de_otros_meses_no_cuentan():
    ventas = [_venta(2025, 12, 15, 9), _venta(2026, 4, 15, 9)]

    assert [m["units"] for m in analitica.agrupar_por_mes(ventas, MESES)] == [0, 0, 0]


def test_el_mes_se_cuenta_en_la_hora_de_uruguay():
    # 31 de enero a las 23:30 en Montevideo: en UTC ya es 1 de febrero.
    tarde = datetime(2026, 1, 31, 23, 30, tzinfo=URUGUAY)
    assert tarde.astimezone(timezone.utc).month == 2

    por_mes = analitica.agrupar_por_mes([(tarde, 1, 100)], MESES)

    assert [m["units"] for m in por_mes] == [1, 0, 0]


def test_una_fecha_sin_zona_horaria_se_toma_como_utc():
    # Así las devuelve SQLite: 1 de febrero a las 02:00 UTC es 31 de enero acá.
    assert analitica.mes_de(datetime(2026, 2, 1, 2, 0)) == (2026, 1)


def test_el_mes_en_curso_se_lleva_a_mes_completo():
    # El 15 de abril (mes de 30 días) va por la mitad: 15 unidades son 30.
    serie = analitica.completar_mes_en_curso([10, 20, 15], date(2026, 4, 15))

    assert serie.tolist() == [10, 20, 30]


def test_el_ultimo_dia_del_mes_el_mes_en_curso_queda_igual():
    assert analitica.completar_mes_en_curso([7, 8], date(2026, 4, 30)).tolist() == [7, 8]


# --- Proyección (HU 5.5) ---


def test_proyeccion_con_tendencia_creciente():
    # Escenario de la HU: 10, 20 y 30 unidades en tres meses seguidos.
    assert analitica.proyectar([10, 20, 30]) == 40


def test_proyeccion_nunca_negativa():
    # Caída fuerte: la recta daría -20 el mes siguiente.
    proyectada = analitica.proyectar([100, 60, 20])

    assert proyectada >= 0
    assert proyectada == 0


def test_proyeccion_con_ventas_constantes_es_el_mismo_valor():
    assert analitica.proyectar([12] * 12) == 12


def test_proyeccion_sin_ventas_es_cero():
    assert analitica.proyectar([0] * 12) == 0


def test_proyeccion_redondea_a_un_decimal():
    # Recta de mínimos cuadrados por (0, 1), (1, 2), (2, 4): en 3 da 5,33.
    assert analitica.proyectar([1, 2, 4]) == 5.3


def test_proyeccion_de_un_solo_mes_o_de_ninguno():
    assert analitica.proyectar([7]) == 7
    assert analitica.proyectar([]) == 0


def test_proyecta_varios_repuestos_a_la_vez():
    series = np.array([[10, 20, 30], [100, 60, 20], [5, 5, 5]])

    assert analitica.proyectar_series(series).tolist() == [40, 0, 5]


def test_proyectar_no_modifica_la_serie_recibida():
    ventas = [10, 20, 15]
    analitica.completar_mes_en_curso(ventas, date(2026, 4, 15))
    analitica.proyectar(ventas)

    assert ventas == [10, 20, 15]


# --- Días de cobertura y riesgo (HU 5.6) ---


def test_riesgo_alto():
    # Escenario de la HU: 10 unidades y 2 por día.
    dias = analitica.dias_de_cobertura(10, 2)

    assert dias == 5
    assert analitica.nivel_de_riesgo(dias) == analitica.RIESGO_ALTO


def test_riesgo_bajo():
    # Escenario de la HU: 100 unidades y 1 por día.
    dias = analitica.dias_de_cobertura(100, 1)

    assert dias == 100
    assert analitica.nivel_de_riesgo(dias) == analitica.RIESGO_BAJO


@pytest.mark.parametrize(
    ("dias", "nivel"),
    [
        (0, analitica.RIESGO_ALTO),
        (14.9, analitica.RIESGO_ALTO),
        (15, analitica.RIESGO_MEDIO),
        (30, analitica.RIESGO_MEDIO),
        (30.1, analitica.RIESGO_BAJO),
    ],
)
def test_umbrales_de_riesgo(dias, nivel):
    assert analitica.nivel_de_riesgo(dias) == nivel


def test_sin_stock_y_con_demanda_el_riesgo_es_alto():
    assert analitica.dias_de_cobertura(0, 1.5) == 0
    assert analitica.nivel_de_riesgo(0) == analitica.RIESGO_ALTO


def test_sin_demanda_proyectada_no_hay_cobertura_que_calcular():
    dias = analitica.dias_de_cobertura(3, 0)

    assert dias is None
    assert analitica.nivel_de_riesgo(dias) == analitica.RIESGO_BAJO


def test_la_demanda_diaria_reparte_el_mes_en_sus_dias():
    assert analitica.demanda_diaria(60, (2026, 4)) == 2  # abril: 30 días
    assert analitica.demanda_diaria(31, (2026, 1)) == 1  # enero: 31 días
