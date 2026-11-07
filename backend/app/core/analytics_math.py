"""Cálculos del dashboard del vendedor (HU 5.4, 5.5 y 5.6).

Funciones puras, sin base de datos: reciben las ventas ya leídas y
devuelven los indicadores. Así se prueban con datos chicos y conocidos,
y los endpoints de /analytics solo leen la base y arman la respuesta.
"""

from calendar import monthrange
from collections.abc import Iterable, Sequence
from datetime import date, datetime, timedelta, timezone

import numpy as np

# Uruguay no tiene horario de verano desde 2015. El mes de una venta se
# cuenta en la hora de acá: una compra del 31 a las 22 h es de ese mes,
# aunque en UTC ya sea el día 1 del siguiente.
URUGUAY = timezone(timedelta(hours=-3))

# La proyección siempre usa el último año, sea cual sea el período que
# mira el vendedor: con 3 puntos la recta depende demasiado del azar.
FORECAST_MONTHS = 12

# Niveles de riesgo de agotamiento según los días de cobertura. Los
# umbrales son la propuesta de la HU 5.6, a confirmar en la planificación.
HIGH_RISK = "high"
MEDIUM_RISK = "medium"
LOW_RISK = "low"
HIGH_RISK_DAYS = 15  # menos de 15 días: alto
MEDIUM_RISK_DAYS = 30  # de 15 a 30: medio; más de 30: bajo
RISK_ORDER = {HIGH_RISK: 0, MEDIUM_RISK: 1, LOW_RISK: 2}

Month = tuple[int, int]  # (año, mes)


def today_in_uruguay() -> date:
    return datetime.now(URUGUAY).date()


def month_text(period: Month) -> str:
    """(2026, 3) -> "2026-03", como viaja en la API."""
    return f"{period[0]:04d}-{period[1]:02d}"


def next_month(period: Month) -> Month:
    anio, number_value = period
    return (anio + 1, 1) if number_value == 12 else (anio, number_value + 1)


def days_in_month(period: Month) -> int:
    return monthrange(*period)[1]


def last_months(today_date: date, qty: int) -> list[Month]:
    """Los últimos `cantidad` meses calendario, del más viejo al actual
    (el mes en curso incluido)."""
    periods = []
    anio, number_value = today_date.year, today_date.month
    for _ in range(qty):
        periods.append((anio, number_value))
        anio, number_value = (anio, number_value - 1) if number_value > 1 else (anio - 1, 12)
    return list(reversed(periods))


def month_start(period: Month) -> datetime:
    """Primer instante del mes en Uruguay, para filtrar los pedidos."""
    return datetime(period[0], period[1], 1, tzinfo=URUGUAY)


def month_of(when: datetime) -> Month:
    # SQLite devuelve las fechas sin zona horaria: se toman como UTC.
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    local = when.astimezone(URUGUAY)
    return local.year, local.month


def group_by_month(
    sales: Iterable[tuple[datetime, int, int]], periods: Sequence[Month]
) -> list[dict]:
    """Ventas (fecha, unidades, facturación) -> un total por mes.

    Devuelve un elemento por cada mes de `meses`, en ese orden, también
    los que no tuvieron ventas (con 0): un mes sin ventas es un dato, no
    un hueco en el gráfico. Las ventas de otros meses se ignoran.
    """
    totales = {period: [0, 0] for period in periods}
    for when, units, revenue_total in sales:
        total = totales.get(month_of(when))
        if total is not None:
            total[0] += units
            total[1] += revenue_total
    return [
        {"month": month_text(period), "units": units, "revenue": revenue_total}
        for period, (units, revenue_total) in totales.items()
    ]


def complete_current_month(units, today_date: date) -> np.ndarray:
    """Serie mensual (o una por fila) cuyo último mes es el actual -> una
    copia con el mes en curso llevado a mes completo, al ritmo que lleva.

    Sin esto, el mes en curso siempre parece una caída (el día 10 lleva
    un tercio de las ventas) y la recta proyectaría a la baja. El día de
    hoy cuenta entero: el 27 de un mes de 31 días se multiplica por 31/27.
    """
    series_item = np.array(units, dtype=float)
    if series_item.shape[-1] > 0:
        series_item[..., -1] /= today_date.day / days_in_month((today_date.year, today_date.month))
    return series_item


def project_series(series_list: np.ndarray) -> np.ndarray:
    """Una serie mensual por fila -> la demanda proyectada del mes
    siguiente de cada una, con una regresión lineal (mínimos cuadrados).

    La recta se ajusta sobre los meses 0..n-1 y se evalúa en n. Nunca da
    menos de 0: una caída fuerte no puede proyectar ventas negativas. Se
    redondea a un decimal.
    """
    series_list = np.asarray(series_list, dtype=float)
    result_rows, periods = series_list.shape
    if result_rows == 0:
        return np.zeros(0)
    if periods == 0:
        return np.zeros(result_rows)
    if periods == 1:
        return np.round(np.maximum(series_list[:, 0], 0), 1)

    # polyfit ajusta todas las filas juntas si se le pasan como columnas.
    pending, sorted_list = np.polyfit(np.arange(periods), series_list.T, 1)
    return np.round(np.maximum(pending * periods + sorted_list, 0), 1)


def proyectar(sales: Sequence[float]) -> float:
    """Ventas mensuales de un repuesto -> demanda proyectada del mes siguiente."""
    return float(project_series(np.array([sales], dtype=float))[0])


def demand_per_day_value(monthly_demand: float, period: Month) -> float:
    """La demanda proyectada de un mes, repartida en sus días."""
    return monthly_demand / days_in_month(period)


def coverage_days(stock: int, demand_per_day: float) -> float | None:
    """Cuántos días alcanza el stock al ritmo proyectado. None si no se
    proyecta demanda: a ese ritmo el stock no se agota."""
    if demand_per_day <= 0:
        return None
    return round(stock / demand_per_day, 1)


def risk_level(day_count: float | None) -> str:
    if day_count is None:
        return LOW_RISK
    if day_count < HIGH_RISK_DAYS:
        return HIGH_RISK
    if day_count <= MEDIUM_RISK_DAYS:
        return MEDIUM_RISK
    return LOW_RISK
