"""Genera pedidos históricos de los últimos 12 meses.

Usage: python -m scripts.seed_order_history [--semilla 2026] [--hasta AAAA-MM-DD]
       (en Docker: docker exec backend uv run python -m scripts.seed_order_history)

Para el dashboard del vendedor (más vendidos, evolución de ventas,
proyección de demanda, riesgo de agotamiento y alertas de reposición),
que se calcula sobre pedidos pasados. Correr scripts.seed antes: usa el
catálogo cargado.

Crea clientes ficticios (cliente001@historico.autobought.com, ...) con su
dirección y su tarjeta, y pedidos guardados igual que los reales. Nadie
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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.crud import payment_method as crud_payment
from app.crud import shipping_address as crud_address
from app.crud import user as crud_user
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.client import Client
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.schemas.payment_method import PaymentMethodCreate
from app.schemas.shipping_address import ShippingAddressCreate
import app.models

SEMILLA = 2026
MESES = 12
CANTIDAD_CLIENTES = 300
DOMINIO_CLIENTES = "historico.autobought.com"

# Pedidos por mes al principio y al final del año (tendencia creciente).
PEDIDOS_PRIMER_MES = 350
PEDIDOS_ULTIMO_MES = 650

# Cuánto se vende cada tipo de repuesto: los consumibles (aceite,
# escobillas, filtros, pastillas, bujías) mucho más que un faro.
DEMANDA_CATEGORIA = {
    "Lubricantes": 15, "Accesorios": 8, "Filtros": 4, "Frenos": 3, "Encendido": 3,
    "Eléctrico": 2, "Suspensión": 1.2, "Motor": 1, "Refrigeración": 1, "Carrocería": 0.6,
}
# Dentro de cada categoría, a cada repuesto le toca un puesto al azar: unos
# pocos se venden mucho más que el resto (Zipf: el puesto n pesa 1 / n^0.7).
EXPONENTE_ZIPF = 0.7

# Cuántos repuestos distintos lleva un pedido, y cuántas unidades de cada uno.
ITEMS_POR_PEDIDO = ([1, 2, 3], [60, 30, 10])
CANTIDADES = ([1, 2, 3], [80, 17, 3])
PROB_JUEGO_DE_BUJIAS = 0.6

# Repuestos en riesgo: se eligen de estas categorías los de menos stock, y
# se ajusta su demanda para que el último mes vendan ~2 veces su stock.
CATEGORIAS_EN_RIESGO = ["Encendido", "Frenos", "Motor", "Refrigeración"]
EN_RIESGO_POR_CATEGORIA = 2
VENTAS_SOBRE_STOCK = 2
# Con menos stock, "vende el doble" son 2 o 3 unidades: no luce como alerta.
STOCK_MINIMO_EN_RIESGO = 5

URUGUAY = timezone(timedelta(hours=-3))

# Multiplicador del total de pedidos según el mes.
ESTACIONALIDAD_GENERAL = {
    1: 0.75, 2: 0.85, 3: 0.95, 4: 1.0, 5: 1.0, 6: 1.05,
    7: 1.1, 8: 1.05, 9: 1.0, 10: 1.05, 11: 1.1, 12: 1.3,
}

# Multiplicador de una categoría según el mes (el resto de los meses, 1).
ESTACIONALIDAD_CATEGORIA = {
    "Refrigeración": {11: 1.4, 12: 2.2, 1: 2.5, 2: 2.0, 3: 1.3, 6: 0.6, 7: 0.6, 8: 0.6},
    "Encendido": {5: 1.3, 6: 2.0, 7: 2.3, 8: 1.8, 9: 1.2, 12: 0.7, 1: 0.6, 2: 0.7},
    "Accesorios": {4: 1.5, 5: 1.8, 6: 2.0, 7: 2.0, 8: 1.6, 12: 0.6, 1: 0.5, 2: 0.6},
    # El frío es lo que más baterías mata.
    "Eléctrico": {5: 1.4, 6: 2.2, 7: 2.5, 8: 2.0, 9: 1.3, 12: 0.6, 1: 0.5, 2: 0.6},
}

# Igual, pero para repuestos sueltos (por cómo empieza el nombre), cuando
# no es toda la categoría: el de habitáculo se cambia antes del verano,
# para usar el aire acondicionado.
ESTACIONALIDAD_REPUESTO = {
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
MARCAS = [("Visa", 45), ("Mastercard", 30), ("OCA", 20), ("American Express", 5)]


@dataclass
class Resumen:
    clientes: int
    pedidos: int
    unidades: int
    en_riesgo: list[str]
    salteado: bool = False


def _ya_generado(db: Session) -> bool:
    return db.scalar(
        select(Client.user_id).where(Client.email.like(f"%@{DOMINIO_CLIENTES}")).limit(1)
    ) is not None


def _meses(hasta: date) -> list[tuple[date, date]]:
    """Primer y último día de cada uno de los últimos 12 meses (el actual,
    hasta `hasta`), del más viejo al más nuevo."""
    meses = []
    anio, mes = hasta.year, hasta.month
    for _ in range(MESES):
        inicio = date(anio, mes, 1)
        siguiente = date(anio + mes // 12, mes % 12 + 1, 1)
        meses.append((inicio, min(siguiente - timedelta(days=1), hasta)))
        anio, mes = (anio, mes - 1) if mes > 1 else (anio - 1, 12)
    return list(reversed(meses))


def _crear_clientes(db: Session, rng: random.Random, hasta: date) -> list[dict]:
    # Un solo hash (bcrypt es lento a propósito) de una contraseña que no se guarda.
    password_hash = hash_password(secrets.token_urlsafe(32))
    vencimiento = f"12/{(hasta.year + 3) % 100:02d}"
    clientes = []

    for n in range(1, CANTIDAD_CLIENTES + 1):
        nombre = f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)}"
        client = crud_user.create_client(
            db,
            name=nombre,
            email=f"cliente{n:03d}@{DOMINIO_CLIENTES}",
            password_hash=password_hash,
            phone=f"+59899{rng.randrange(100000, 1000000)}",
        )
        ciudad, departamento, calles = rng.choice(LOCALIDADES)
        direccion = crud_address.create_address(db, client.user_id, ShippingAddressCreate(
            personal_name="Casa",
            street=rng.choice(calles),
            number=str(rng.randrange(100, 4000)),
            city=ciudad,
            department=departamento,
        ))
        marca = rng.choices([m for m, _ in MARCAS], [p for _, p in MARCAS])[0]
        tarjeta = crud_payment.create_payment_method(db, client.user_id, PaymentMethodCreate(
            card_type=marca,
            holder=nombre,
            last_four=f"{rng.randrange(10000):04d}",
            expiry=vencimiento,
        ))
        clientes.append({"id": client.user_id, "direccion": direccion, "tarjeta": tarjeta})

    return clientes


def _popularidad(parts: list[Part], rng: random.Random) -> tuple[dict[int, float], list[Part]]:
    """Peso base de cada repuesto (cuánto se elige al armar un pedido)."""
    peso = {}
    for categoria in sorted({p.category for p in parts}):
        de_la_categoria = [p for p in parts if p.category == categoria]
        rng.shuffle(de_la_categoria)
        for puesto, p in enumerate(de_la_categoria, start=1):
            peso[p.id] = DEMANDA_CATEGORIA.get(categoria, 1) / puesto ** EXPONENTE_ZIPF

    en_riesgo = []
    for categoria in CATEGORIAS_EN_RIESGO:
        con_stock = sorted(
            (p for p in parts if p.category == categoria and p.stock >= STOCK_MINIMO_EN_RIESGO),
            key=lambda p: (p.stock, p.part_code),
        )
        en_riesgo += con_stock[:EN_RIESGO_POR_CATEGORIA]

    # Peso que hace falta para que el último mes vendan VENTAS_SOBRE_STOCK
    # veces su stock: participación objetivo sobre el total de elecciones.
    items_promedio = sum(n * p for n, p in zip(*ITEMS_POR_PEDIDO)) / sum(ITEMS_POR_PEDIDO[1])
    elecciones_ultimo_mes = PEDIDOS_ULTIMO_MES * items_promedio
    resto = sum(w for pid, w in peso.items() if pid not in {p.id for p in en_riesgo})
    participaciones = {
        p.id: VENTAS_SOBRE_STOCK * p.stock / (elecciones_ultimo_mes * _unidades_promedio(p))
        for p in en_riesgo
    }
    for p in en_riesgo:
        peso[p.id] = participaciones[p.id] * resto / (1 - sum(participaciones.values()))

    return peso, en_riesgo


def _estacionalidad(part: Part, mes: int) -> float:
    factor = ESTACIONALIDAD_CATEGORIA.get(part.category, {}).get(mes, 1.0)
    for prefijo, por_mes in ESTACIONALIDAD_REPUESTO.items():
        if part.name.startswith(prefijo):
            factor *= por_mes.get(mes, 1.0)
    return factor


def _estado(creado: date, hasta: date, rng: random.Random) -> OrderStatus:
    if rng.random() < 0.03:
        return OrderStatus.CANCELLED
    dias = (hasta - creado).days
    if dias <= 3:
        return OrderStatus.CONFIRMED
    if dias <= 10:
        return OrderStatus.SHIPPED
    return OrderStatus.DELIVERED


def _es_bujia(part: Part) -> bool:
    return part.name.startswith("Bujía")


def _unidades_promedio(part: Part) -> float:
    comun = sum(c * p for c, p in zip(*CANTIDADES)) / sum(CANTIDADES[1])
    if _es_bujia(part):
        return PROB_JUEGO_DE_BUJIAS * 4 + (1 - PROB_JUEGO_DE_BUJIAS) * comun
    return comun


def _cantidad(part: Part, rng: random.Random) -> int:
    # Las bujías se cambian de a juegos de 4.
    if _es_bujia(part) and rng.random() < PROB_JUEGO_DE_BUJIAS:
        return 4
    return rng.choices(*CANTIDADES)[0]


def generar_historial(db: Session, semilla: int = SEMILLA, hasta: date | None = None) -> Resumen:
    hasta = hasta or date.today()

    if _ya_generado(db):
        return Resumen(clientes=0, pedidos=0, unidades=0, en_riesgo=[], salteado=True)

    # Ordenados por código, no por id: el orden no depende de la base.
    parts = list(db.scalars(select(Part).order_by(Part.part_code)))
    if not parts:
        raise RuntimeError("No hay repuestos cargados: correr antes scripts.seed.")

    rng = random.Random(semilla)
    clientes = _crear_clientes(db, rng, hasta)
    peso_base, en_riesgo = _popularidad(parts, rng)

    total_pedidos = total_unidades = 0
    meses = _meses(hasta)

    for numero, (inicio, fin) in enumerate(meses):
        # Tendencia lineal + estacionalidad + un poco de ruido.
        tendencia = PEDIDOS_PRIMER_MES + (PEDIDOS_ULTIMO_MES - PEDIDOS_PRIMER_MES) * numero / (MESES - 1)
        dias_del_mes = (date(inicio.year + inicio.month // 12, inicio.month % 12 + 1, 1) - inicio).days
        fraccion = ((fin - inicio).days + 1) / dias_del_mes  # el mes actual va incompleto
        cantidad = round(
            tendencia * ESTACIONALIDAD_GENERAL[inicio.month] * rng.uniform(0.9, 1.1) * fraccion
        )

        pesos_acumulados = list(accumulate(
            peso_base[p.id] * _estacionalidad(p, inicio.month) for p in parts
        ))

        pedidos_del_mes = []
        for _ in range(cantidad):
            dia = inicio + timedelta(days=rng.randrange((fin - inicio).days + 1))
            hora = time(rng.randrange(8, 23), rng.randrange(60), rng.randrange(60))
            cliente = rng.choice(clientes)
            direccion, tarjeta = cliente["direccion"], cliente["tarjeta"]

            elegidos: list[Part] = []
            for _ in range(rng.choices(*ITEMS_POR_PEDIDO)[0]):
                part = rng.choices(parts, cum_weights=pesos_acumulados)[0]
                if part not in elegidos:
                    elegidos.append(part)

            pedido = Order(
                client_id=cliente["id"],
                created_at=datetime.combine(dia, hora, tzinfo=URUGUAY),
                status=_estado(dia, hasta, rng),
                shipping_address_id=direccion.shipping_address_id,
                payment_method_id=tarjeta.payment_method_id,
                ship_personal_name=direccion.personal_name,
                ship_street=direccion.street,
                ship_number=direccion.number,
                ship_apartment=direccion.apartment,
                ship_city=direccion.city,
                ship_department=direccion.department,
                ship_postal_code=direccion.postal_code,
                payment_method_label=tarjeta.method,
            )
            # Se insertan directo, sin place_order: no tienen que descontar stock.
            for part in elegidos:
                unidades = _cantidad(part, rng)
                pedido.items.append(OrderItem(part_id=part.id, quantity=unidades, frozen_price=part.price))
                total_unidades += unidades
            pedidos_del_mes.append(pedido)

        db.add_all(pedidos_del_mes)
        db.commit()
        total_pedidos += len(pedidos_del_mes)

    return Resumen(
        clientes=len(clientes),
        pedidos=total_pedidos,
        unidades=total_unidades,
        en_riesgo=[p.part_code for p in en_riesgo],
    )


def main():
    parser = argparse.ArgumentParser(description="Genera pedidos históricos de los últimos 12 meses.")
    parser.add_argument("--semilla", type=int, default=SEMILLA)
    parser.add_argument("--hasta", type=date.fromisoformat, default=None,
                        help="último día del historial (AAAA-MM-DD); por defecto, hoy")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        resumen = generar_historial(db, semilla=args.semilla, hasta=args.hasta)
    finally:
        db.close()

    if resumen.salteado:
        print("Ya hay pedidos históricos, no se generan de nuevo.")
        return
    print(
        f"{resumen.pedidos} pedidos ({resumen.unidades} unidades) de "
        f"{resumen.clientes} clientes ficticios en los últimos {MESES} meses."
    )
    print(f"Repuestos en riesgo (stock bajo y ventas altas): {', '.join(resumen.en_riesgo)}")


if __name__ == "__main__":
    main()
