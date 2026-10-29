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
MESES_PROYECCION = 12

# Niveles de riesgo de agotamiento según los días de cobertura. Los
# umbrales son la propuesta de la HU 5.6, a confirmar en la planificación.
RIESGO_ALTO = "high"
RIESGO_MEDIO = "medium"
RIESGO_BAJO = "low"
DIAS_RIESGO_ALTO = 15  # menos de 15 días: alto
DIAS_RIESGO_MEDIO = 30  # de 15 a 30: medio; más de 30: bajo
ORDEN_RIESGO = {RIESGO_ALTO: 0, RIESGO_MEDIO: 1, RIESGO_BAJO: 2}

Mes = tuple[int, int]  # (año, mes)


def hoy_en_uruguay() -> date:
    return datetime.now(URUGUAY).date()


def texto_mes(mes: Mes) -> str:
    """(2026, 3) -> "2026-03", como viaja en la API."""
    return f"{mes[0]:04d}-{mes[1]:02d}"


def mes_siguiente(mes: Mes) -> Mes:
    anio, numero = mes
    return (anio + 1, 1) if numero == 12 else (anio, numero + 1)


def dias_del_mes(mes: Mes) -> int:
    return monthrange(*mes)[1]


def ultimos_meses(hoy: date, cantidad: int) -> list[Mes]:
    """Los últimos `cantidad` meses calendario, del más viejo al actual
    (el mes en curso incluido)."""
    meses = []
    anio, numero = hoy.year, hoy.month
    for _ in range(cantidad):
        meses.append((anio, numero))
        anio, numero = (anio, numero - 1) if numero > 1 else (anio - 1, 12)
    return list(reversed(meses))


def inicio_del_mes(mes: Mes) -> datetime:
    """Primer instante del mes en Uruguay, para filtrar los pedidos."""
    return datetime(mes[0], mes[1], 1, tzinfo=URUGUAY)


def mes_de(fecha: datetime) -> Mes:
    # SQLite devuelve las fechas sin zona horaria: se toman como UTC.
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    local = fecha.astimezone(URUGUAY)
    return local.year, local.month


def agrupar_por_mes(
    ventas: Iterable[tuple[datetime, int, int]], meses: Sequence[Mes]
) -> list[dict]:
    """Ventas (fecha, unidades, facturación) -> un total por mes.

    Devuelve un elemento por cada mes de `meses`, en ese orden, también
    los que no tuvieron ventas (con 0): un mes sin ventas es un dato, no
    un hueco en el gráfico. Las ventas de otros meses se ignoran.
    """
    totales = {mes: [0, 0] for mes in meses}
    for fecha, unidades, facturacion in ventas:
        total = totales.get(mes_de(fecha))
        if total is not None:
            total[0] += unidades
            total[1] += facturacion
    return [
        {"month": texto_mes(mes), "units": unidades, "revenue": facturacion}
        for mes, (unidades, facturacion) in totales.items()
    ]


def completar_mes_en_curso(unidades, hoy: date) -> np.ndarray:
    """Serie mensual (o una por fila) cuyo último mes es el actual -> una
    copia con el mes en curso llevado a mes completo, al ritmo que lleva.

    Sin esto, el mes en curso siempre parece una caída (el día 10 lleva
    un tercio de las ventas) y la recta proyectaría a la baja. El día de
    hoy cuenta entero: el 27 de un mes de 31 días se multiplica por 31/27.
    """
    serie = np.array(unidades, dtype=float)
    if serie.shape[-1] > 0:
        serie[..., -1] /= hoy.day / dias_del_mes((hoy.year, hoy.month))
    return serie


def proyectar_series(series: np.ndarray) -> np.ndarray:
    """Una serie mensual por fila -> la demanda proyectada del mes
    siguiente de cada una, con una regresión lineal (mínimos cuadrados).

    La recta se ajusta sobre los meses 0..n-1 y se evalúa en n. Nunca da
    menos de 0: una caída fuerte no puede proyectar ventas negativas. Se
    redondea a un decimal.
    """
    series = np.asarray(series, dtype=float)
    filas, meses = series.shape
    if filas == 0:
        return np.zeros(0)
    if meses == 0:
        return np.zeros(filas)
    if meses == 1:
        return np.round(np.maximum(series[:, 0], 0), 1)

    # polyfit ajusta todas las filas juntas si se le pasan como columnas.
    pendiente, ordenada = np.polyfit(np.arange(meses), series.T, 1)
    return np.round(np.maximum(pendiente * meses + ordenada, 0), 1)


def proyectar(ventas: Sequence[float]) -> float:
    """Ventas mensuales de un repuesto -> demanda proyectada del mes siguiente."""
    return float(proyectar_series(np.array([ventas], dtype=float))[0])


def demanda_diaria(demanda_mensual: float, mes: Mes) -> float:
    """La demanda proyectada de un mes, repartida en sus días."""
    return demanda_mensual / dias_del_mes(mes)


def dias_de_cobertura(stock: int, demanda_por_dia: float) -> float | None:
    """Cuántos días alcanza el stock al ritmo proyectado. None si no se
    proyecta demanda: a ese ritmo el stock no se agota."""
    if demanda_por_dia <= 0:
        return None
    return round(stock / demanda_por_dia, 1)


def nivel_de_riesgo(dias: float | None) -> str:
    if dias is None:
        return RIESGO_BAJO
    if dias < DIAS_RIESGO_ALTO:
        return RIESGO_ALTO
    if dias <= DIAS_RIESGO_MEDIO:
        return RIESGO_MEDIO
    return RIESGO_BAJO
