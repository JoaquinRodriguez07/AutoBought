from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.part import Part
from app.models.compatibility import Compatibility
from app.models.car_model import CarModel
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem


def get_part(db: Session, part_id: int) -> Part | None:
    return db.get(Part, part_id)


def list_parts(
    db: Session,
    brand: str | None = None,
    model: str | None = None,
    year: int | None = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    engine_codes: list[str] | None = None,
) -> list[Part]:
    query = (
        select(Part)
        .join(Compatibility)
        .join(CarModel)
        .options(
            selectinload(Part.compatibilities).selectinload(
                Compatibility.car_model
            )
        )
        .distinct()
        .order_by(Part.id)
    )

    if brand:
        brand_term = brand.strip()
        query = query.where(func.lower(CarModel.brand) == brand_term.lower())

    if model:
        model_term = model.strip()
        query = query.where(func.lower(CarModel.model) == model_term.lower())

    if engine_codes:
        # Lista de motores ya en minúsculas (ej: los diésel para "gasolero").
        query = query.where(func.lower(CarModel.engine_code).in_(engine_codes))

    if year:
        query = query.where(
            Compatibility.year_from <= year,
            Compatibility.year_to >= year,
        )

    # Búsqueda parcial, insensible a mayúsculas/minúsculas, por nombre o código.
    # Permite encontrar un repuesto sin ingresar el código completo
    # (ej: "BP12" encuentra "BP1234").
    term = (search or "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.where(
            or_(
                Part.name.ilike(pattern),
                Part.part_code.ilike(pattern),
            )
        )

    # Filtro exacto (insensible a mayúsculas/minúsculas) por categoría.
    # A diferencia de la búsqueda por nombre/código, no admite coincidencias
    # parciales porque la categoría es un valor discreto (ej: "frenos").
    categoria_term = (category or "").strip()
    if categoria_term:
        query = query.where(func.lower(Part.category) == categoria_term.lower())

    return list(db.scalars(query).unique().all())


def list_categories(db: Session) -> list[tuple[str, int]]:
    # Cantidad real de repuestos por categoría, agrupando por el valor tal
    # cual está guardado en la columna (case-sensitive), a diferencia de
    # list_parts que filtra sin distinguir mayúsculas/minúsculas. Si
    # coexistieran "Brakes" y "brakes", se mostrarían como categorías
    # separadas con conteos propios, pero filtrar por cualquiera de las dos
    # devolvería el mismo total combinado (conteo del sidebar ≠ resultados).
    # Ordenado alfabéticamente por nombre; las categorías sin repuestos no
    # aparecen (GROUP BY las excluye naturalmente).
    query = (
        select(Part.category, func.count(Part.id))
        .group_by(Part.category)
        .order_by(Part.category)
    )
    return [(category, count) for category, count in db.execute(query).all()]


def list_best_sellers(
    db: Session,
    limit: int,
    days: int | None = None,
    in_stock: bool = False,
) -> list[tuple[Part, int]]:
    # Unidades vendidas por repuesto, de mayor a menor. Los pedidos
    # cancelados no cuentan y los repuestos sin ventas no aparecen (el JOIN
    # con order_item los deja afuera). El empate se desempata por id para
    # que el orden sea siempre el mismo.
    #   - days: solo las ventas de los últimos N días (None = todas).
    #   - in_stock: saltea los que hoy no tienen stock. La tienda lo usa
    #     para no ofrecer algo que no se puede comprar; el dashboard no,
    #     porque un más vendido sin stock es justo lo que hay que reponer.
    units_sold = func.sum(OrderItem.quantity).label("units_sold")
    query = (
        select(Part, units_sold)
        .join(OrderItem, OrderItem.part_id == Part.id)
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(Order.status != OrderStatus.CANCELLED)
        .options(
            selectinload(Part.compatibilities).selectinload(
                Compatibility.car_model
            )
        )
        .group_by(Part.id)
        .order_by(units_sold.desc(), Part.id)
        .limit(limit)
    )

    if days is not None:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.where(Order.created_at >= since)

    if in_stock:
        query = query.where(Part.stock > 0)

    return [(part, int(units)) for part, units in db.execute(query).all()]
