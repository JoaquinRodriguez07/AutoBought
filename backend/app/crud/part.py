from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, or_, select
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


def filtrar_repuestos(
    query,
    category: str | None = None,
    search: str | None = None,
    part_id: int | None = None,
):
    # Filtros del dashboard del vendedor (HU 5.9), los mismos en todas sus
    # vistas: categoría exacta y búsqueda parcial por nombre o código, sin
    # distinguir mayúsculas, igual que en el catálogo.
    categoria_term = (category or "").strip()
    if categoria_term:
        query = query.where(func.lower(Part.category) == categoria_term.lower())

    term = (search or "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.where(or_(Part.name.ilike(pattern), Part.part_code.ilike(pattern)))

    if part_id is not None:
        query = query.where(Part.id == part_id)

    return query


def list_stock(
    db: Session,
    category: str | None = None,
    search: str | None = None,
) -> list[Part]:
    # Todo el catálogo para el dashboard del vendedor, de menos a más stock:
    # lo que hay que reponer queda arriba. Sin compatibilidades: el
    # dashboard no las muestra.
    query = select(Part).order_by(Part.stock, Part.part_code, Part.id)
    query = filtrar_repuestos(query, category=category, search=search)
    return list(db.scalars(query).all())


def list_best_sellers(
    db: Session,
    limit: int,
    days: int | None = None,
    in_stock: bool = False,
    since: datetime | None = None,
    category: str | None = None,
    search: str | None = None,
) -> list[tuple[Part, int]]:
    # Unidades vendidas por repuesto, de mayor a menor. Los pedidos
    # cancelados no cuentan y los repuestos sin ventas no aparecen (el JOIN
    # con order_item los deja afuera). El empate se desempata por id para
    # que el orden sea siempre el mismo.
    #   - days: solo las ventas de los últimos N días (None = todas).
    #   - in_stock: saltea los que hoy no tienen stock. La tienda lo usa
    #     para no ofrecer algo que no se puede comprar; el dashboard no,
    #     porque un más vendido sin stock es justo lo que hay que reponer.
    #   - since: solo las ventas desde ese momento. El dashboard lo usa
    #     para contar meses calendario enteros en vez de N días.
    #   - category / search: los filtros del dashboard (filtrar_repuestos).
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

    if since is not None:
        query = query.where(Order.created_at >= since)

    if in_stock:
        query = query.where(Part.stock > 0)

    query = filtrar_repuestos(query, category=category, search=search)

    return [(part, int(units)) for part, units in db.execute(query).all()]


# --- Alta y edición desde el dashboard del vendedor (HU 5.10) ---


def part_code_in_use(db: Session, part_code: str, exclude_id: int | None = None) -> bool:
    # El código identifica al repuesto ante el vendedor: no se repite,
    # aunque la base no lo exija (sin distinguir mayúsculas).
    query = select(Part.id).where(func.lower(Part.part_code) == part_code.lower())
    if exclude_id is not None:
        query = query.where(Part.id != exclude_id)
    return db.scalar(query.limit(1)) is not None


def missing_car_models(db: Session, car_model_ids: list[int]) -> list[int]:
    existentes = set(db.scalars(select(CarModel.id).where(CarModel.id.in_(car_model_ids))))
    return [car_model_id for car_model_id in car_model_ids if car_model_id not in existentes]


def _set_data(db: Session, part: Part, data) -> None:
    campos = data.model_dump(exclude={"compatibilities", "stock"})
    for campo, valor in campos.items():
        setattr(part, campo, valor)

    # Se reemplazan todas: el formulario manda la lista completa.
    if part.id is not None:
        db.execute(delete(Compatibility).where(Compatibility.part_id == part.id))
        db.expire(part, ["compatibilities"])
    part.compatibilities = [
        Compatibility(car_model_id=c.car_model_id, year_from=c.year_from, year_to=c.year_to)
        for c in data.compatibilities
    ]


def create_part(db: Session, data) -> Part:
    part = Part(stock=data.stock)
    db.add(part)
    _set_data(db, part, data)
    db.commit()
    db.refresh(part)
    return part


def update_part(db: Session, part: Part, data) -> Part:
    # El stock no cambia acá: se ajusta con set_stock.
    _set_data(db, part, data)
    db.commit()
    db.refresh(part)
    return part


def set_stock(db: Session, part: Part, stock: int) -> Part:
    part.stock = stock
    db.commit()
    db.refresh(part)
    return part
