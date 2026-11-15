"""Consultas del dashboard: ventas por repuesto y mes, y la proyección de demanda."""

from dataclasses import dataclass
from datetime import date, datetime

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import analytics_math
from app.crud.part import filter_parts
from app.crud.payment import is_paid_order
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment


def _sold() -> tuple:
    """Qué pedidos cuentan como venta en todas las métricas del dashboard: no
    cancelados y pagos, con el mismo criterio que los más vendidos
    (`crud.part.list_best_sellers`). Un pedido con el pago pendiente,
    rechazado o vencido (aunque todavía no se haya cancelado) no suma.
    Pide un outer join con Payment."""
    return Order.status != OrderStatus.CANCELLED, is_paid_order()


def list_sales(
    db: Session,
    since: datetime,
    category: str | None = None,
    search: str | None = None,
    part_id: int | None = None,
) -> list[tuple[int, datetime, int, int]]:
    # Cada ítem vendido desde `since`: (repuesto, fecha del pedido,
    # unidades, facturación). Igual que en los más vendidos, solo cuentan
    # los pedidos pagos y no cancelados (ver _sold). El agrupado por mes se
    # hace en Python (analytics_math.group_by_month): SQLite y Postgres
    # truncan fechas distinto y el mes se cuenta en la hora de Uruguay.
    query = (
        select(
            OrderItem.part_id,
            Order.created_at,
            OrderItem.quantity,
            OrderItem.quantity * OrderItem.frozen_price,
        )
        .join(Order, Order.order_id == OrderItem.order_id)
        .join(Part, Part.id == OrderItem.part_id)
        .outerjoin(Payment, Payment.order_id == Order.order_id)
        .where(*_sold(), Order.created_at >= since)
    )
    query = filter_parts(query, category=category, search=search, part_id=part_id)
    return [(pid, when, int(units), int(revenue_total)) for pid, when, units, revenue_total in db.execute(query).all()]


def units_sold_total(db: Session, part_id: int) -> int:
    # Todas las ventas del repuesto, sin límite de fecha.
    query = (
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.order_id == OrderItem.order_id)
        .outerjoin(Payment, Payment.order_id == Order.order_id)
        .where(OrderItem.part_id == part_id, *_sold())
    )
    return int(db.scalar(query))


@dataclass
class Forecast:
    part: Part
    # Unidades vendidas en cada uno de los últimos 12 meses (el actual,
    # hasta hoy, al final).
    units_by_month: list[int]
    projected_units: float
    daily_demand: float
    coverage_days: float | None
    risk: str


def forecasts(
    db: Session,
    today_date: date,
    category: str | None = None,
    search: str | None = None,
    part_id: int | None = None,
) -> tuple[analytics_math.Month, list[Forecast]]:
    """Demanda proyectada del mes que viene y riesgo de agotamiento de
    cada repuesto que cumple los filtros, también de los que no se
    vendieron nunca (proyectan 0). Devuelve el mes proyectado y la lista.

    Solo lee: no cambia ventas ni stock.
    """
    periods = analytics_math.last_months(today_date, analytics_math.FORECAST_MONTHS)
    forecast_month = analytics_math.next_month(periods[-1])

    query = filter_parts(
        select(Part).order_by(Part.part_code, Part.id),
        category=category,
        search=search,
        part_id=part_id,
    )
    parts = list(db.scalars(query).all())
    if not parts:
        return forecast_month, []

    column_name = {period: i for i, period in enumerate(periods)}
    row = {part.id: i for i, part in enumerate(parts)}
    units = np.zeros((len(parts), len(periods)), dtype=int)
    sales = list_sales(
        db,
        since=analytics_math.month_start(periods[0]),
        category=category,
        search=search,
        part_id=part_id,
    )
    for pid, when, qty, _ in sales:
        period = column_name.get(analytics_math.month_of(when))
        if period is not None and pid in row:
            units[row[pid], period] += qty

    # Todos los repuestos a la vez, con el mes en curso llevado a mes completo.
    projected_values = analytics_math.project_series(analytics_math.complete_current_month(units, today_date))

    result = []
    for part, series_item, projected in zip(parts, units, projected_values):
        per_day = analytics_math.demand_per_day_value(float(projected), forecast_month)
        day_count = analytics_math.coverage_days(part.stock, per_day)
        result.append(
            Forecast(
                part=part,
                units_by_month=[int(u) for u in series_item],
                projected_units=float(projected),
                daily_demand=round(per_day, 2),
                coverage_days=day_count,
                risk=analytics_math.risk_level(day_count),
            )
        )
    return forecast_month, result


def urgency_key(row: Forecast) -> tuple:
    """Orden de las alertas de reposición, del más urgente al menos urgente.

    Primero por nivel. Dentro de cada nivel, los que dejarían más unidades
    sin cubrir el mes que viene; si no, un agotado que vende 0,3 por mes
    taparía a uno que vende 50 y le quedan 6 días. Después, los que se
    agotan antes; sin demanda, al final.
    """
    return (
        analytics_math.RISK_ORDER[row.risk],
        -max(row.projected_units - row.part.stock, 0),
        row.coverage_days is None,
        row.coverage_days or 0,
        row.part.part_code,
        row.part.id,
    )
