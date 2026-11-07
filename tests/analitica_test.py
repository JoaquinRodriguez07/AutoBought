"""Cálculos del dashboard del vendedor (app/core/analytics_math.py), con datos
chicos y conocidos: agrupado por mes (HU 5.4), proyección (HU 5.5) y
riesgo de agotamiento (HU 5.6)."""

from datetime import date, datetime, timezone

import numpy as np
import pytest

from app.core import analytics_math
from app.core.analytics_math import URUGUAY


# --- Meses ---


def test_ultimos_meses_incluye_el_actual_y_cruza_el_anio():
    assert analytics_math.last_months(date(2026, 2, 10), 4) == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]


def test_mes_siguiente_de_diciembre_es_enero():
    assert analytics_math.next_month((2026, 12)) == (2027, 1)
    assert analytics_math.next_month((2026, 3)) == (2026, 4)


# --- Agrupado por mes (HU 5.4) ---

MONTHS = [(2026, 1), (2026, 2), (2026, 3)]


def _sale(anio, period, day_number, units, price_value=100, hora=12, zona=URUGUAY):
    return datetime(anio, period, day_number, hora, tzinfo=zona), units, units * price_value


def test_agrupa_unidades_y_facturacion_por_mes():
    sales = [
        _sale(2026, 1, 5, 2),
        _sale(2026, 1, 20, 3, price_value=200),
        _sale(2026, 3, 1, 4),
    ]

    assert analytics_math.group_by_month(sales, MONTHS) == [
        {"month": "2026-01", "units": 5, "revenue": 800},
        {"month": "2026-02", "units": 0, "revenue": 0},
        {"month": "2026-03", "units": 4, "revenue": 400},
    ]


def test_un_mes_sin_ventas_vale_cero_y_las_de_otros_meses_no_cuentan():
    sales = [_sale(2025, 12, 15, 9), _sale(2026, 4, 15, 9)]

    assert [m["units"] for m in analytics_math.group_by_month(sales, MONTHS)] == [0, 0, 0]


def test_el_mes_se_cuenta_en_la_hora_de_uruguay():
    # 31 de enero a las 23:30 en Montevideo: en UTC ya es 1 de febrero.
    tarde = datetime(2026, 1, 31, 23, 30, tzinfo=URUGUAY)
    assert tarde.astimezone(timezone.utc).month == 2

    by_month = analytics_math.group_by_month([(tarde, 1, 100)], MONTHS)

    assert [m["units"] for m in by_month] == [1, 0, 0]


def test_una_fecha_sin_zona_horaria_se_toma_como_utc():
    # Así las devuelve SQLite: 1 de febrero a las 02:00 UTC es 31 de enero acá.
    assert analytics_math.month_of(datetime(2026, 2, 1, 2, 0)) == (2026, 1)


def test_el_mes_en_curso_se_lleva_a_mes_completo():
    # El 15 de abril (mes de 30 días) va por la mitad: 15 unidades son 30.
    series_item = analytics_math.complete_current_month([10, 20, 15], date(2026, 4, 15))

    assert series_item.tolist() == [10, 20, 30]


def test_el_ultimo_dia_del_mes_el_mes_en_curso_queda_igual():
    assert analytics_math.complete_current_month([7, 8], date(2026, 4, 30)).tolist() == [7, 8]


# --- Proyección (HU 5.5) ---


def test_proyeccion_con_tendencia_creciente():
    # Escenario de la HU: 10, 20 y 30 unidades en tres meses seguidos.
    assert analytics_math.proyectar([10, 20, 30]) == 40


def test_proyeccion_nunca_negativa():
    # Caída fuerte: la recta daría -20 el mes siguiente.
    projected = analytics_math.proyectar([100, 60, 20])

    assert projected >= 0
    assert projected == 0


def test_proyeccion_con_ventas_constantes_es_el_mismo_valor():
    assert analytics_math.proyectar([12] * 12) == 12


def test_proyeccion_sin_ventas_es_cero():
    assert analytics_math.proyectar([0] * 12) == 0


def test_proyeccion_redondea_a_un_decimal():
    # Recta de mínimos cuadrados por (0, 1), (1, 2), (2, 4): en 3 da 5,33.
    assert analytics_math.proyectar([1, 2, 4]) == 5.3


def test_proyeccion_de_un_solo_mes_o_de_ninguno():
    assert analytics_math.proyectar([7]) == 7
    assert analytics_math.proyectar([]) == 0


def test_proyecta_varios_repuestos_a_la_vez():
    series_list = np.array([[10, 20, 30], [100, 60, 20], [5, 5, 5]])

    assert analytics_math.project_series(series_list).tolist() == [40, 0, 5]


def test_proyectar_no_modifica_la_serie_recibida():
    sales = [10, 20, 15]
    analytics_math.complete_current_month(sales, date(2026, 4, 15))
    analytics_math.proyectar(sales)

    assert sales == [10, 20, 15]


# --- Días de cobertura y riesgo (HU 5.6) ---


def test_riesgo_alto():
    # Escenario de la HU: 10 unidades y 2 por día.
    day_count = analytics_math.coverage_days(10, 2)

    assert day_count == 5
    assert analytics_math.risk_level(day_count) == analytics_math.HIGH_RISK


def test_riesgo_bajo():
    # Escenario de la HU: 100 unidades y 1 por día.
    day_count = analytics_math.coverage_days(100, 1)

    assert day_count == 100
    assert analytics_math.risk_level(day_count) == analytics_math.LOW_RISK


@pytest.mark.parametrize(
    ("day_count", "level"),
    [
        (0, analytics_math.HIGH_RISK),
        (14.9, analytics_math.HIGH_RISK),
        (15, analytics_math.MEDIUM_RISK),
        (30, analytics_math.MEDIUM_RISK),
        (30.1, analytics_math.LOW_RISK),
    ],
)
def test_umbrales_de_riesgo(day_count, level):
    assert analytics_math.risk_level(day_count) == level


def test_sin_stock_y_con_demanda_el_riesgo_es_alto():
    assert analytics_math.coverage_days(0, 1.5) == 0
    assert analytics_math.risk_level(0) == analytics_math.HIGH_RISK


def test_sin_demanda_proyectada_no_hay_cobertura_que_calcular():
    day_count = analytics_math.coverage_days(3, 0)

    assert day_count is None
    assert analytics_math.risk_level(day_count) == analytics_math.LOW_RISK


def test_la_demanda_diaria_reparte_el_mes_en_sus_dias():
    assert analytics_math.demand_per_day_value(60, (2026, 4)) == 2  # abril: 30 días
    assert analytics_math.demand_per_day_value(31, (2026, 1)) == 1  # enero: 31 días
