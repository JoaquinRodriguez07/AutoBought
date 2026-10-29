from dataclasses import dataclass
from datetime import date, datetime

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import analitica
from app.crud.part import filtrar_repuestos
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part


def list_sales(
    db: Session,
    since: datetime,
    category: str | None = None,
    search: str | None = None,
    part_id: int | None = None,
) -> list[tuple[int, datetime, int, int]]:
    # Cada ítem vendido desde `since`: (repuesto, fecha del pedido,
    # unidades, facturación). Igual que en los más vendidos, los pedidos
    # cancelados no cuentan. El agrupado por mes se hace en Python
    # (analitica.agrupar_por_mes): SQLite y Postgres truncan fechas
    # distinto y el mes se cuenta en la hora de Uruguay.
    query = (
        select(
            OrderItem.part_id,
            Order.created_at,
            OrderItem.quantity,
            OrderItem.quantity * OrderItem.frozen_price,
        )
        .join(Order, Order.order_id == OrderItem.order_id)
        .join(Part, Part.id == OrderItem.part_id)
        .where(Order.status != OrderStatus.CANCELLED, Order.created_at >= since)
    )
    query = filtrar_repuestos(query, category=category, search=search, part_id=part_id)
    return [(pid, fecha, int(unidades), int(facturacion)) for pid, fecha, unidades, facturacion in db.execute(query).all()]


def units_sold_total(db: Session, part_id: int) -> int:
    # Todas las ventas del repuesto, sin límite de fecha.
    query = (
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(OrderItem.part_id == part_id, Order.status != OrderStatus.CANCELLED)
    )
    return int(db.scalar(query))


@dataclass
class Proyeccion:
    part: Part
    # Unidades vendidas en cada uno de los últimos 12 meses (el actual,
    # hasta hoy, al final).
    units_by_month: list[int]
    projected_units: float
    daily_demand: float
    coverage_days: float | None
    risk: str


def proyecciones(
    db: Session,
    hoy: date,
    category: str | None = None,
    search: str | None = None,
    part_id: int | None = None,
) -> tuple[analitica.Mes, list[Proyeccion]]:
    """Demanda proyectada del mes que viene y riesgo de agotamiento de
    cada repuesto que cumple los filtros, también de los que no se
    vendieron nunca (proyectan 0). Devuelve el mes proyectado y la lista.

    Solo lee: no cambia ventas ni stock.
    """
    meses = analitica.ultimos_meses(hoy, analitica.MESES_PROYECCION)
    mes_proyectado = analitica.mes_siguiente(meses[-1])

    query = filtrar_repuestos(
        select(Part).order_by(Part.part_code, Part.id),
        category=category,
        search=search,
        part_id=part_id,
    )
    parts = list(db.scalars(query).all())
    if not parts:
        return mes_proyectado, []

    columna = {mes: i for i, mes in enumerate(meses)}
    fila = {part.id: i for i, part in enumerate(parts)}
    unidades = np.zeros((len(parts), len(meses)), dtype=int)
    ventas = list_sales(
        db,
        since=analitica.inicio_del_mes(meses[0]),
        category=category,
        search=search,
        part_id=part_id,
    )
    for pid, fecha, cantidad, _ in ventas:
        mes = columna.get(analitica.mes_de(fecha))
        if mes is not None and pid in fila:
            unidades[fila[pid], mes] += cantidad

    # Todos los repuestos a la vez, con el mes en curso llevado a mes completo.
    proyectadas = analitica.proyectar_series(analitica.completar_mes_en_curso(unidades, hoy))

    resultado = []
    for part, serie, proyectada in zip(parts, unidades, proyectadas):
        por_dia = analitica.demanda_diaria(float(proyectada), mes_proyectado)
        dias = analitica.dias_de_cobertura(part.stock, por_dia)
        resultado.append(
            Proyeccion(
                part=part,
                units_by_month=[int(u) for u in serie],
                projected_units=float(proyectada),
                daily_demand=round(por_dia, 2),
                coverage_days=dias,
                risk=analitica.nivel_de_riesgo(dias),
            )
        )
    return mes_proyectado, resultado
