"""Genera pedidos históricos de los últimos 12 meses.

Usage: python -m scripts.seed_order_history [--semilla 2026] [--hasta AAAA-MM-DD]
       (en Docker: docker exec backend uv run python -m scripts.seed_order_history)

Para el dashboard del vendedor (más vendidos, evolución de ventas,
proyección de demanda, riesgo de agotamiento y alertas de reposición),
que se calcula sobre pedidos pasados. Correr scripts.seed antes: usa el
catálogo cargado.

Crea clientes ficticios (cliente001@historico.autobought.com, ...) con su
dirección, y pedidos guardados igual que los reales (pagados con
Mercado Pago). Nadie
puede iniciar sesión con esos clientes: su contraseña es aleatoria y no
se guarda.

Forma de los datos:
- Tendencia: las ventas crecen a lo largo del año.
- Estacionalidad: diciembre es el mes más fuerte y enero el más flojo;
  refrigeración se vende más en verano, baterías y encendido en invierno
  (arranques en frío), escobillas en otoño e invierno (lluvias) y filtros
  de habitáculo en primavera (antes de usar el aire acondicionado).
- Los consumibles (aceite, escobillas, filtros, pastillas, bujías) se
  venden más que un faro, y dentro de eso hay pocos repuestos estrella y
  muchos lentos (distribución de Zipf).
- Repuestos en riesgo: los 2 de menos stock (desde 5 unidades) de
  encendido, frenos, motor y refrigeración venden en el último mes ~2
  veces su stock, para que las alertas de reposición tengan casos.

Reproducible: con la misma semilla y la misma fecha `--hasta` se generan
exactamente los mismos pedidos. Sin `--hasta` se usa hoy, así que en
otro día se obtienen los mismos pedidos corridos en el tiempo.

No descuenta stock: el stock del catálogo ya es el de hoy.
Si ya hay pedidos históricos, no hace nada.
"""

import argparse
import random
import secrets
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from itertools import accumulate

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.crud import shipping_address as crud_address
from app.crud import order as crud_order
from app.crud import user as crud_user
from app.db.migrations import require_head
from app.db.session import SessionLocal, engine
from app.models.client import Client
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus
from app.schemas.shipping_address import ShippingAddressCreate
import app.models

SEMILLA = 2026
MONTHS = 12
CLIENT_COUNT = 300
DOMINIO_CLIENTES = "historico.autobought.com"

# Pedidos por mes al principio y al final del año (tendencia creciente).
FIRST_MONTH_ORDERS = 350
LAST_MONTH_ORDERS = 650

# Cuánto se vende cada tipo de repuesto: los consumibles (aceite,
# escobillas, filtros, pastillas, bujías) mucho más que un faro.
CATEGORY_DEMAND = {
    "Lubricantes": 15, "Accesorios": 8, "Filtros": 4, "Frenos": 3, "Encendido": 3,
    "Eléctrico": 2, "Suspensión": 1.2, "Motor": 1, "Refrigeración": 1, "Carrocería": 0.6,
    "Dirección": 1, "Transmisión": 0.8, "Escape": 0.6, "Climatización": 0.5,
}
# Dentro de cada categoría, a cada repuesto le toca un puesto al azar: unos
# pocos se venden mucho más que el resto (Zipf: el puesto n pesa 1 / n^0.7).
EXPONENTE_ZIPF = 0.7

# Cuántos repuestos distintos lleva un pedido, y cuántas unidades de cada uno.
ITEMS_PER_ORDER = ([1, 2, 3], [60, 30, 10])
CANTIDADES = ([1, 2, 3], [80, 17, 3])
SPARK_PLUG_SET_PROBABILITY = 0.6

# Repuestos en riesgo: se eligen de estas categorías los de menos stock, y
# se ajusta su demanda para que el último mes vendan ~3 veces su stock
# (con 2, el azar a veces los dejaba vendiendo menos que su stock).
AT_RISK_CATEGORIES = ["Encendido", "Frenos", "Motor", "Refrigeración"]
AT_RISK_BY_CATEGORY = 2
SALES_OVER_STOCK = 3
# Con menos stock, "vende el triple" son pocas unidades: no luce como alerta.
MIN_AT_RISK_STOCK = 5

URUGUAY = timezone(timedelta(hours=-3))

# Multiplicador del total de pedidos según el mes.
ESTACIONALIDAD_GENERAL = {
    1: 0.75, 2: 0.85, 3: 0.95, 4: 1.0, 5: 1.0, 6: 1.05,
    7: 1.1, 8: 1.05, 9: 1.0, 10: 1.05, 11: 1.1, 12: 1.3,
}

# Multiplicador de una categoría según el mes (el resto de los meses, 1).
CATEGORY_SEASONALITY = {
    "Refrigeración": {11: 1.4, 12: 2.2, 1: 2.5, 2: 2.0, 3: 1.3, 6: 0.6, 7: 0.6, 8: 0.6},
    "Encendido": {5: 1.3, 6: 2.0, 7: 2.3, 8: 1.8, 9: 1.2, 12: 0.7, 1: 0.6, 2: 0.7},
    "Accesorios": {4: 1.5, 5: 1.8, 6: 2.0, 7: 2.0, 8: 1.6, 12: 0.6, 1: 0.5, 2: 0.6},
    # El frío es lo que más baterías mata.
    "Eléctrico": {5: 1.4, 6: 2.2, 7: 2.5, 8: 2.0, 9: 1.3, 12: 0.6, 1: 0.5, 2: 0.6},
    # El aire acondicionado se arregla antes y durante el verano.
    "Climatización": {10: 1.4, 11: 1.9, 12: 2.4, 1: 2.5, 2: 1.8, 5: 0.5, 6: 0.4, 7: 0.4, 8: 0.5},
}

# Igual, pero para repuestos sueltos (por cómo empieza el nombre), cuando
# no es toda la categoría: el de habitáculo se cambia antes del verano,
# para usar el aire acondicionado.
PART_SEASONALITY = {
    "Filtro de habitáculo": {9: 1.4, 10: 1.8, 11: 2.0, 12: 1.8, 1: 1.3, 5: 0.6, 6: 0.5, 7: 0.5},
}

NOMBRES = [
    "Sofía", "Mateo", "Valentina", "Santiago", "Camila", "Joaquín", "Martina",
    "Benjamín", "Lucía", "Nicolás", "Florencia", "Facundo", "Agustina", "Diego",
    "Carolina", "Gonzalo", "Natalia", "Federico", "Paula", "Sebastián",
]
APELLIDOS = [
    "González", "Rodríguez", "Fernández", "López", "Martínez", "Pérez", "García",
    "Sánchez", "Silva", "Pereira", "Suárez", "Méndez", "Castro", "Núñez",
    "Acosta", "Sosa", "Ramírez", "Olivera", "Cabrera", "Díaz",
]
# ciudad, departamento, calles
LOCALIDADES = [
    ("Montevideo", "Montevideo", ["Av. Italia", "Bv. Artigas", "Av. 18 de Julio", "Av. Rivera", "Colonia"]),
    ("Ciudad de la Costa", "Canelones", ["Av. Giannattasio", "Calle Racine"]),
    ("Las Piedras", "Canelones", ["Av. Artigas", "Calle Batlle y Ordóñez"]),
    ("Maldonado", "Maldonado", ["Av. Roosevelt", "Calle Sarandí"]),
    ("Salto", "Salto", ["Calle Uruguay", "Av. Batlle"]),
    ("Paysandú", "Paysandú", ["Av. España", "Calle 18 de Julio"]),
    ("Rivera", "Rivera", ["Av. Sarandí", "Calle Agraciada"]),
    ("Colonia del Sacramento", "Colonia", ["Av. General Flores", "Calle Rivera"]),
]


@dataclass
class Resumen:
    customers: int
    orders_list: int
    units: int
    at_risk: list[str]
    skipped: bool = False


def _already_generated(db: Session) -> bool:
    return db.scalar(
        select(Client.user_id).where(Client.email.like(f"%@{DOMINIO_CLIENTES}")).limit(1)
    ) is not None


def _months(until: date) -> list[tuple[date, date]]:
    """Primer y último día de cada uno de los últimos 12 meses (el actual,
    hasta `hasta`), del más viejo al más nuevo."""
    periods = []
    anio, period = until.year, until.month
    for _ in range(MONTHS):
        start_at = date(anio, period, 1)
        next_value = date(anio + period // 12, period % 12 + 1, 1)
        periods.append((start_at, min(next_value - timedelta(days=1), until)))
        anio, period = (anio, period - 1) if period > 1 else (anio - 1, 12)
    return list(reversed(periods))


def _create_clients(db: Session, rng: random.Random) -> list[dict]:
    # Un solo hash (bcrypt es lento a propósito) de una contraseña que no se guarda.
    password_hash = hash_password(secrets.token_urlsafe(32))
    customers = []

    for n in range(1, CLIENT_COUNT + 1):
        name_value = f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)}"
        client = crud_user.create_client(
            db,
            name=name_value,
            email=f"cliente{n:03d}@{DOMINIO_CLIENTES}",
            password_hash=password_hash,
            phone=f"+59899{rng.randrange(100000, 1000000)}",
        )
        # Son ficticios: que las tareas diarias no les manden recordatorios.
        crud_user.set_marketing_emails(db, client, False)
        city_name, department_name, calles = rng.choice(LOCALIDADES)
        address = crud_address.create_address(db, client.user_id, ShippingAddressCreate(
            personal_name="Casa",
            street=rng.choice(calles),
            number=str(rng.randrange(100, 4000)),
            city=city_name,
            department=department_name,
        ))
        # Copia de lo que necesitan los pedidos: así, después de cada commit,
        # no hay que volver a leer la dirección de la base.
        customers.append({"id": client.user_id, "direccion": {
            "id": address.shipping_address_id,
            "personal_name": address.personal_name,
            "street": address.street,
            "number": address.number,
            "apartment": address.apartment,
            "city": address.city,
            "department": address.department,
            "postal_code": address.postal_code,
        }})

    return customers


def _popularidad(parts: list[Part], rng: random.Random) -> tuple[dict[int, float], list[Part]]:
    """Peso base de cada repuesto (cuánto se elige al armar un pedido)."""
    peso = {}
    for categoria in sorted({p.category for p in parts}):
        of_category = [p for p in parts if p.category == categoria]
        rng.shuffle(of_category)
        for puesto, p in enumerate(of_category, start=1):
            peso[p.id] = CATEGORY_DEMAND.get(categoria, 1) / puesto ** EXPONENTE_ZIPF

    at_risk = []
    for categoria in AT_RISK_CATEGORIES:
        with_stock = sorted(
            (p for p in parts if p.category == categoria and p.stock >= MIN_AT_RISK_STOCK),
            key=lambda p: (p.stock, p.part_code),
        )
        at_risk += with_stock[:AT_RISK_BY_CATEGORY]

    # Peso que hace falta para que el último mes vendan VENTAS_SOBRE_STOCK
    # veces su stock: participación objetivo sobre el total de elecciones.
    average_items = sum(n * p for n, p in zip(*ITEMS_PER_ORDER)) / sum(ITEMS_PER_ORDER[1])
    last_month_choices = LAST_MONTH_ORDERS * average_items
    resto = sum(w for pid, w in peso.items() if pid not in {p.id for p in at_risk})
    shares = {
        p.id: SALES_OVER_STOCK * p.stock / (last_month_choices * _average_units(p))
        for p in at_risk
    }
    for p in at_risk:
        peso[p.id] = shares[p.id] * resto / (1 - sum(shares.values()))

    return peso, at_risk


def _estacionalidad(part: Part, period: int) -> float:
    factor = CATEGORY_SEASONALITY.get(part.category, {}).get(period, 1.0)
    for prefijo, by_month in PART_SEASONALITY.items():
        if part.name.startswith(prefijo):
            factor *= by_month.get(period, 1.0)
    return factor


def _status(created: date, until: date, rng: random.Random) -> OrderStatus:
    if rng.random() < 0.03:
        return OrderStatus.CANCELLED
    day_count = (until - created).days
    if day_count <= 1:
        return OrderStatus.CONFIRMED
    if day_count <= 3:
        return OrderStatus.PACKING
    if day_count <= 10:
        return OrderStatus.SHIPPED
    return OrderStatus.DELIVERED


def _is_spark_plug(part: Part) -> bool:
    return part.name.startswith("Bujía")


def _average_units(part: Part) -> float:
    comun = sum(c * p for c, p in zip(*CANTIDADES)) / sum(CANTIDADES[1])
    if _is_spark_plug(part):
        return SPARK_PLUG_SET_PROBABILITY * 4 + (1 - SPARK_PLUG_SET_PROBABILITY) * comun
    return comun


def _quantity(part: Part, rng: random.Random) -> int:
    # Las bujías se cambian de a juegos de 4.
    if _is_spark_plug(part) and rng.random() < SPARK_PLUG_SET_PROBABILITY:
        return 4
    return rng.choices(*CANTIDADES)[0]


def generate_history(db: Session, semilla: int = SEMILLA, until: date | None = None) -> Resumen:
    until = until or date.today()

    if _already_generated(db):
        return Resumen(customers=0, orders_list=0, units=0, at_risk=[], skipped=True)

    # Ordenados por código, no por id: el orden no depende de la base.
    parts = list(db.scalars(select(Part).order_by(Part.part_code)))
    if not parts:
        raise RuntimeError("No hay repuestos cargados: correr antes scripts.seed.")

    rng = random.Random(semilla)
    customers = _create_clients(db, rng)
    # Crear los clientes hace commits, que vencen los repuestos cargados. Se
    # vuelven a leer y se separan de la sesión: así los commits de cada mes
    # no obligan a releer los 4000 repuestos uno por uno.
    parts = list(db.scalars(select(Part).order_by(Part.part_code)))
    db.expunge_all()
    base_weight, at_risk = _popularidad(parts, rng)

    orders_total = units_total = 0
    periods = _months(until)

    for number_value, (start_at, end) in enumerate(periods):
        # Tendencia lineal + estacionalidad + un poco de ruido.
        tendencia = FIRST_MONTH_ORDERS + (LAST_MONTH_ORDERS - FIRST_MONTH_ORDERS) * number_value / (MONTHS - 1)
        days_in_month = (date(start_at.year + start_at.month // 12, start_at.month % 12 + 1, 1) - start_at).days
        fraction = ((end - start_at).days + 1) / days_in_month  # el mes actual va incompleto
        qty = round(
            tendencia * ESTACIONALIDAD_GENERAL[start_at.month] * rng.uniform(0.9, 1.1) * fraction
        )

        cumulative_weights = list(accumulate(
            base_weight[p.id] * _estacionalidad(p, start_at.month) for p in parts
        ))

        # Se insertan directo, sin place_order (no tienen que descontar stock),
        # y en tandas: un INSERT de muchas filas por tabla y por mes. De a
        # un pedido son decenas de miles de viajes a la base, y contra una
        # base remota el script tarda horas.
        month_orders = []
        month_items = []
        for _ in range(qty):
            day_number = start_at + timedelta(days=rng.randrange((end - start_at).days + 1))
            hora = time(rng.randrange(8, 23), rng.randrange(60), rng.randrange(60))
            customer = rng.choice(customers)
            address = customer["direccion"]

            chosen_parts: list[Part] = []
            for _ in range(rng.choices(*ITEMS_PER_ORDER)[0]):
                part = rng.choices(parts, cum_weights=cumulative_weights)[0]
                if part not in chosen_parts:
                    chosen_parts.append(part)

            month_orders.append({
                "client_id": customer["id"],
                "created_at": datetime.combine(day_number, hora, tzinfo=URUGUAY),
                "status": _status(day_number, until, rng),
                "shipping_address_id": address["id"],
                "ship_personal_name": address["personal_name"],
                "ship_street": address["street"],
                "ship_number": address["number"],
                "ship_apartment": address["apartment"],
                "ship_city": address["city"],
                "ship_department": address["department"],
                "ship_postal_code": address["postal_code"],
                "payment_method_label": crud_order.PAYMENT_LABEL,
            })
            items = []
            for part in chosen_parts:
                units = _quantity(part, rng)
                items.append({"part_id": part.id, "quantity": units, "frozen_price": part.price})
                units_total += units
            month_items.append(items)

        if month_orders:
            ids = db.scalars(
                insert(Order).returning(Order.order_id, sort_by_parameter_order=True),
                month_orders,
            ).all()
            db.execute(
                insert(Payment),
                [{"order_id": order_id, "status": PaymentStatus.APPROVED} for order_id in ids],
            )
            db.execute(
                insert(OrderItem),
                [
                    {**item, "order_id": order_id}
                    for order_id, items in zip(ids, month_items)
                    for item in items
                ],
            )
        db.commit()
        orders_total += len(month_orders)

    return Resumen(
        customers=len(customers),
        orders_list=orders_total,
        units=units_total,
        at_risk=[p.part_code for p in at_risk],
    )


def main():
    parser = argparse.ArgumentParser(description="Genera pedidos históricos de los últimos 12 meses.")
    parser.add_argument("--semilla", type=int, default=SEMILLA)
    parser.add_argument("--hasta", type=date.fromisoformat, default=None,
                        help="último día del historial (AAAA-MM-DD); por defecto, hoy")
    args = parser.parse_args()

    require_head(engine)
    db = SessionLocal()
    try:
        resumen = generate_history(db, semilla=args.semilla, until=args.until)
    finally:
        db.close()

    if resumen.skipped:
        print("Ya hay pedidos históricos, no se generan de nuevo.")
        return
    print(
        f"{resumen.orders_list} pedidos ({resumen.units} unidades) de "
        f"{resumen.customers} clientes ficticios en los últimos {MONTHS} meses."
    )
    print(f"Repuestos en riesgo (stock bajo y ventas altas): {', '.join(resumen.at_risk)}")


if __name__ == "__main__":
    main()
