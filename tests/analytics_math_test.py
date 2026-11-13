"""Cálculos del dashboard del vendedor (app/core/analytics_math.py), con datos
chicos y conocidos: agrupado por mes (HU 5.4), proyección (HU 5.5) y
riesgo de agotamiento (HU 5.6)."""

from datetime import date, datetime, timezone

import numpy as np
import pytest

from app.core import analytics_math
from app.core.analytics_math import URUGUAY


# --- Meses ---


def test_last_months_includes_the_current_and_crosses_the_year():
    assert analytics_math.last_months(date(2026, 2, 10), 4) == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]


def test_last_months_never_goes_past_the_maximum():
    periods = analytics_math.last_months(date(2026, 2, 10), 1000)
    assert len(periods) == analytics_math.MAX_MONTHS
    assert periods[-1] == (2026, 2)


def test_month_next_of_december_is_january():
    assert analytics_math.next_month((2026, 12)) == (2027, 1)
    assert analytics_math.next_month((2026, 3)) == (2026, 4)


# --- Agrupado por mes (HU 5.4) ---

MONTHS = [(2026, 1), (2026, 2), (2026, 3)]


def _sale(anio, period, day_number, units, price_value=100, hora=12, zona=URUGUAY):
    return datetime(anio, period, day_number, hora, tzinfo=zona), units, units * price_value


def test_groups_units_and_revenue_by_month():
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


def test_a_month_without_sales_counts_zero_and_the_of_others_months_no_count():
    sales = [_sale(2025, 12, 15, 9), _sale(2026, 4, 15, 9)]

    assert [m["units"] for m in analytics_math.group_by_month(sales, MONTHS)] == [0, 0, 0]


def test_the_month_account_in_the_hour_of_uruguay():
    # 31 de enero a las 23:30 en Montevideo: en UTC ya es 1 de febrero.
    tarde = datetime(2026, 1, 31, 23, 30, tzinfo=URUGUAY)
    assert tarde.astimezone(timezone.utc).month == 2

    by_month = analytics_math.group_by_month([(tarde, 1, 100)], MONTHS)

    assert [m["units"] for m in by_month] == [1, 0, 0]


def test_a_date_without_zone_time_takes_as_utc():
    # Así las devuelve SQLite: 1 de febrero a las 02:00 UTC es 31 de enero acá.
    assert analytics_math.month_of(datetime(2026, 2, 1, 2, 0)) == (2026, 1)


def test_the_month_in_progress_takes_a_month_complete():
    # El 15 de abril (mes de 30 días) va por la mitad: 15 unidades son 30.
    series_item = analytics_math.complete_current_month([10, 20, 15], date(2026, 4, 15))

    assert series_item.tolist() == [10, 20, 30]


def test_the_last_day_of_the_month_the_month_in_progress_stays_same():
    assert analytics_math.complete_current_month([7, 8], date(2026, 4, 30)).tolist() == [7, 8]


# --- Proyección (HU 5.5) ---


def test_forecast_with_trend_growing():
    # Escenario de la HU: 10, 20 y 30 unidades en tres meses seguidos.
    assert analytics_math.proyectar([10, 20, 30]) == 40


def test_forecast_never_negative():
    # Caída fuerte: la recta daría -20 el mes siguiente.
    projected = analytics_math.proyectar([100, 60, 20])

    assert projected >= 0
    assert projected == 0


def test_forecast_with_sales_constant_is_the_same_value():
    assert analytics_math.proyectar([12] * 12) == 12


def test_forecast_without_sales_is_zero():
    assert analytics_math.proyectar([0] * 12) == 0


def test_forecast_rounds_a_decimal():
    # Recta de mínimos cuadrados por (0, 1), (1, 2), (2, 4): en 3 da 5,33.
    assert analytics_math.proyectar([1, 2, 4]) == 5.3


def test_forecast_of_a_only_month_or_of_none():
    assert analytics_math.proyectar([7]) == 7
    assert analytics_math.proyectar([]) == 0


def test_projects_several_parts_a_the_time():
    series_list = np.array([[10, 20, 30], [100, 60, 20], [5, 5, 5]])

    assert analytics_math.project_series(series_list).tolist() == [40, 0, 5]


def test_project_no_modifies_the_series_received():
    sales = [10, 20, 15]
    analytics_math.complete_current_month(sales, date(2026, 4, 15))
    analytics_math.proyectar(sales)

    assert sales == [10, 20, 15]


# --- Días de cobertura y riesgo (HU 5.6) ---


def test_risk_high():
    # Escenario de la HU: 10 unidades y 2 por día.
    day_count = analytics_math.coverage_days(10, 2)

    assert day_count == 5
    assert analytics_math.risk_level(day_count) == analytics_math.HIGH_RISK


def test_risk_low():
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
def test_thresholds_of_risk(day_count, level):
    assert analytics_math.risk_level(day_count) == level


def test_without_stock_and_with_demand_the_risk_is_high():
    assert analytics_math.coverage_days(0, 1.5) == 0
    assert analytics_math.risk_level(0) == analytics_math.HIGH_RISK


def test_without_demand_projected_no_there_is_coverage_that_calculate():
    day_count = analytics_math.coverage_days(3, 0)

    assert day_count is None
    assert analytics_math.risk_level(day_count) == analytics_math.LOW_RISK


def test_the_demand_daily_splits_the_month_in_its_days():
    assert analytics_math.demand_per_day_value(60, (2026, 4)) == 2  # abril: 30 días
    assert analytics_math.demand_per_day_value(31, (2026, 1)) == 1  # enero: 31 días
