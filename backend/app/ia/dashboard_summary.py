"""Resumen del dashboard con IA (HU 6.3): de 3 a 5 puntos sobre cómo vienen
las ventas, qué alertas hay y qué conviene hacer.

El backend hace todas las cuentas con los mismos cálculos del dashboard
(app.core.analytics_math y app.crud.analytics) y a la IA le pasa solo esos
números agregados: totales, categorías y repuestos. Nunca datos de clientes.
La IA solo los redacta; no calcula ni ve la base.
"""

import json
from collections import defaultdict
from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy.orm import Session

from app.core import analytics_math
from app.core.config import (
    AI_SUMMARY_AT_RISK,
    AI_SUMMARY_BEST_SELLERS,
    AI_SUMMARY_CATEGORIES,
    CURRENCY,
)
from app.crud import analytics as crud_analytics
from app.ia.client import AIClient
from app.ia.service import ask_structured

# El contrato con el panel del frontend (dashboardApi.js): de 3 a 5 puntos.
MIN_POINTS = 3
MAX_POINTS = 5
MAX_POINT_LENGTH = 300

INSTRUCTIONS = f"""Sos el analista de ventas de AutoBought, una tienda online de repuestos de auto.
Vas a recibir un JSON con las métricas del dashboard del vendedor. Escribí un resumen de
{MIN_POINTS} a {MAX_POINTS} puntos, en español rioplatense, claro y directo:
- cómo vienen las ventas del mes comparadas con el mes anterior,
- las categorías o repuestos que más se mueven,
- las alertas de reposición (riesgo de agotamiento),
- al menos una recomendación concreta.

Reglas:
- Usá solo los números del JSON. No inventes datos, fechas ni repuestos.
- El mes en curso todavía no terminó: compará usando las unidades proyectadas a mes completo.
- Los importes están en la moneda indicada en el JSON.
- Cada punto es una sola oración de hasta {MAX_POINT_LENGTH} caracteres.

Respondé solo con un JSON, sin texto alrededor: {{"points": ["...", "..."]}}"""


class AISummaryReply(BaseModel):
    """Lo que tiene que devolver la IA. Si no cumple, se rechaza entero."""

    points: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_POINT_LENGTH)]
    ] = Field(min_length=MIN_POINTS, max_length=MAX_POINTS)


def _part_info(part) -> dict:
    # Datos del catálogo, públicos en la tienda.
    return {"codigo": part.part_code, "nombre": part.name, "categoria": part.category, "stock": part.stock}


def build_metrics(db: Session, today_date: date) -> dict:
    """Las métricas que se le pasan a la IA, calculadas como en el dashboard.

    Args:
        db: la sesión de la base.
        today_date: el día de hoy en Uruguay (en los tests, uno fijo).

    Returns:
        Un diccionario listo para pasar a JSON: el mes anterior, el mes en
        curso (hasta hoy y proyectado a mes completo), la proyección del mes
        siguiente, las categorías que más crecen y caen, los más vendidos y
        los repuestos con más riesgo de agotarse. Sin datos de clientes.
    """
    periods = analytics_math.last_months(today_date, analytics_math.FORECAST_MONTHS)
    previous, current = periods[-2], periods[-1]
    days_in_current = analytics_math.days_in_month(current)

    # Facturación y unidades del mes anterior y del actual.
    sales = crud_analytics.list_sales(db, since=analytics_math.month_start(previous))
    prev_month, cur_month = analytics_math.group_by_month(
        ((when, units, revenue) for _, when, units, revenue in sales), [previous, current]
    )

    # Proyección y riesgo de cada repuesto (los últimos 12 meses).
    forecast_month, rows = crud_analytics.forecasts(db, today_date)

    # Serie total de 12 meses, con el mes en curso llevado a mes completo:
    # la misma cuenta del gráfico de evolución (HU 5.5).
    total_series = [sum(row.units_by_month[i] for row in rows) for i in range(len(periods))]
    completed = analytics_math.complete_current_month(total_series, today_date)
    projected_current = round(float(completed[-1]), 1)

    # Por categoría: mes anterior contra el actual proyectado a mes completo.
    by_category: dict[str, list[float]] = defaultdict(lambda: [0, 0])
    for row in rows:
        series_item = analytics_math.complete_current_month(row.units_by_month, today_date)
        by_category[row.part.category][0] += row.units_by_month[-2]
        by_category[row.part.category][1] += float(series_item[-1])
    categories = [
        {
            "categoria": name,
            "unidades_mes_anterior": before,
            "unidades_proyectadas_mes_en_curso": round(after, 1),
            "variacion_pct": analytics_math.percent_change(before, after),
        }
        for name, (before, after) in by_category.items()
        if before or after
    ]

    def change(category: dict) -> float:
        return category["unidades_proyectadas_mes_en_curso"] - category["unidades_mes_anterior"]

    growing = sorted((c for c in categories if change(c) > 0), key=lambda c: (-change(c), c["categoria"]))
    falling = sorted((c for c in categories if change(c) < 0), key=lambda c: (change(c), c["categoria"]))

    best_sellers = sorted(
        (row for row in rows if row.units_by_month[-2] > 0),
        key=lambda row: (-row.units_by_month[-2], row.part.part_code),
    )[:AI_SUMMARY_BEST_SELLERS]

    at_risk = sorted(
        (row for row in rows if row.risk != analytics_math.LOW_RISK), key=crud_analytics.urgency_key
    )

    return {
        "fecha": today_date.isoformat(),
        "moneda": CURRENCY,
        "mes_anterior": {
            "mes": prev_month["month"],
            "unidades": prev_month["units"],
            "facturacion": prev_month["revenue"],
        },
        "mes_en_curso": {
            "mes": cur_month["month"],
            "dias_transcurridos": today_date.day,
            "dias_del_mes": days_in_current,
            "unidades_hasta_hoy": cur_month["units"],
            "facturacion_hasta_hoy": cur_month["revenue"],
            "unidades_proyectadas_mes_completo": projected_current,
            "variacion_pct_contra_mes_anterior": analytics_math.percent_change(
                prev_month["units"], projected_current
            ),
        },
        "proyeccion_mes_siguiente": {
            "mes": analytics_math.month_text(forecast_month),
            "unidades": analytics_math.proyectar(completed),
        },
        "categorias_que_mas_crecen": growing[:AI_SUMMARY_CATEGORIES],
        "categorias_que_mas_caen": falling[:AI_SUMMARY_CATEGORIES],
        "mas_vendidos_mes_anterior": [
            {**_part_info(row.part), "unidades": row.units_by_month[-2]} for row in best_sellers
        ],
        "riesgo_agotamiento": {
            "umbral_alto_dias": analytics_math.HIGH_RISK_DAYS,
            "umbral_medio_dias": analytics_math.MEDIUM_RISK_DAYS,
            "repuestos_riesgo_alto": sum(row.risk == analytics_math.HIGH_RISK for row in rows),
            "repuestos_riesgo_medio": sum(row.risk == analytics_math.MEDIUM_RISK for row in rows),
            "mas_urgentes": [
                {
                    **_part_info(row.part),
                    "riesgo": row.risk,
                    "dias_cobertura": row.coverage_days,
                    "demanda_proyectada": row.projected_units,
                }
                for row in at_risk[:AI_SUMMARY_AT_RISK]
            ],
        },
    }


def generate(db: Session, ai_client: AIClient, today_date: date) -> tuple[list[str], int]:
    """Calcula las métricas y le pide a la IA que las redacte.

    Args:
        db: la sesión de la base.
        ai_client: el cliente de IA (en los tests, uno falso).
        today_date: el día de hoy en Uruguay.

    Returns:
        Los puntos del resumen (de 3 a 5) y los tokens que se usaron.

    Raises:
        AIUnavailable: si la IA no responde o no respeta el formato pedido.
    """
    metrics = build_metrics(db, today_date)
    reply, tokens = ask_structured(
        ai_client, INSTRUCTIONS, json.dumps(metrics, ensure_ascii=False), AISummaryReply
    )
    return reply.points, tokens
