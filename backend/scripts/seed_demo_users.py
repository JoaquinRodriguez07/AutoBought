"""Crea clientes de prueba con direcciones y tarjetas ya cargadas.

Usage: python -m scripts.seed_demo_users
       (en Docker: docker exec backend uv run python -m scripts.seed_demo_users)

Los datos pasan por los mismos schemas y funciones que usa la API, así
que cumplen las mismas validaciones que lo que carga un usuario. Si una
regla cambia y algún dato deja de ser válido, el script falla en vez de
dejar datos que la app no aceptaría.

Si un usuario ya existe (mismo correo), se saltea. Correr scripts.seed
antes, para que haya repuestos con los que armar la compra de ejemplo.

| Correo                          | Contraseña    | Qué tiene para probar                          |
|---------------------------------|---------------|------------------------------------------------|
| ana.perez@autobought.com        | Repuestos2026 | 2 direcciones, Visa y Mastercard, una compra   |
| martin.rodriguez@autobought.com | Motor2026x    | Amex, OCA y una tarjeta vencida                |
| lucia.fernandez@autobought.com  | Frenos2026x   | Dirección en el interior con apto. y S/N, OCA  |

Las tarjetas son los números de prueba públicos de cada marca (Visa
4111 1111 1111 1111, Mastercard 5555 5555 5555 4444, Amex 3782 822463
10005). Solo se guardan la marca y los últimos 4 dígitos, como en la app.
Para cargarlas otra vez desde el formulario: cualquier vencimiento
futuro y cualquier CVV (3 dígitos, 4 en Amex).
"""

from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.crud import cart as crud_cart
from app.crud import order as crud_order
from app.crud import payment_method as crud_payment
from app.crud import shipping_address as crud_address
from app.crud import user as crud_user
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.part import Part
from app.models.payment_method import PaymentMethod
from app.schemas.auth import RegisterRequest
from app.schemas.payment_method import PaymentMethodCreate
from app.schemas.shipping_address import ShippingAddressCreate
import app.models

# Vencimientos relativos a hoy, para que las tarjetas no venzan solas.
_VIGENTE = f"12/{(date.today().year + 3) % 100:02d}"
_VIGENTE_2 = f"06/{(date.today().year + 2) % 100:02d}"

USUARIOS = [
    {
        "cuenta": {
            "name": "Ana Pérez",
            "email": "ana.perez@autobought.com",
            "password": "Repuestos2026",
            "phone": "099 123 456",
        },
        "direcciones": [
            {"personal_name": "Casa", "street": "Av. Italia", "number": "2864",
             "apartment": "502", "city": "Montevideo", "department": "Montevideo",
             "postal_code": "11600", "is_primary": True},
            {"personal_name": "Trabajo", "street": "Av. Giannattasio", "number": "1250",
             "city": "Ciudad de la Costa", "department": "Canelones", "postal_code": "15000"},
        ],
        "tarjetas": [
            {"card_type": "Visa", "holder": "Ana Pérez", "last_four": "1111",
             "expiry": _VIGENTE, "is_primary": True},
            {"card_type": "Mastercard", "holder": "Ana Pérez", "last_four": "4444",
             "expiry": _VIGENTE_2},
        ],
        "compra": [("Filtros", 1), ("Frenos", 2)],
    },
    {
        "cuenta": {
            "name": "Martín Rodríguez",
            "email": "martin.rodriguez@autobought.com",
            "password": "Motor2026x",
            "phone": "098 765 432",
        },
        "direcciones": [
            {"personal_name": "Casa de playa", "street": "Rambla Lorenzo Batlle Pacheco",
             "number": "345", "city": "Punta del Este", "department": "Maldonado",
             "postal_code": "20100", "is_primary": True},
        ],
        "tarjetas": [
            {"card_type": "American Express", "holder": "Martín Rodríguez",
             "last_four": "0005", "expiry": _VIGENTE, "is_primary": True},
            {"card_type": "OCA", "holder": "Martín Rodríguez", "last_four": "7890",
             "expiry": _VIGENTE_2},
        ],
        # Para probar cómo se muestra y que no deje pagar con ella.
        "tarjeta_vencida": {"card_type": "Visa", "holder": "Martín Rodríguez",
                            "last_four": "0002", "expiry": "03/24"},
    },
    {
        "cuenta": {
            "name": "Lucía Fernández",
            "email": "lucia.fernandez@autobought.com",
            "password": "Frenos2026x",
            "phone": "4732 1234",
        },
        "direcciones": [
            {"personal_name": "Casa", "street": "Uruguay", "number": "S/N",
             "apartment": "B", "city": "Salto", "department": "Salto",
             "postal_code": "50000", "is_primary": True},
        ],
        "tarjetas": [
            {"card_type": "OCA", "holder": "Lucía Fernández", "last_four": "3456",
             "expiry": _VIGENTE, "is_primary": True},
        ],
    },
]


def _crear_compra(db, client_id: int, items: list[tuple[str, int]]) -> int | None:
    """Arma un carrito con un repuesto de cada categoría y lo compra."""
    for categoria, cantidad in items:
        part = db.scalar(
            select(Part).where(Part.category == categoria, Part.stock >= cantidad).limit(1)
        )
        if part is None:
            return None
        crud_cart.add_item(db, client_id, part.id, cantidad)

    # place_order abre su propia transacción (igual que en el endpoint).
    db.rollback()
    return crud_order.place_order(db, client_id).order_id


def crear_usuario(db, datos: dict) -> str:
    cuenta = RegisterRequest(**datos["cuenta"])

    if crud_user.get_user_by_email(db, cuenta.email):
        return f"{cuenta.email}: ya existe, se saltea."

    client = crud_user.create_client(
        db,
        name=cuenta.name,
        email=cuenta.email,
        password_hash=hash_password(cuenta.password),
        phone=cuenta.phone,
    )
    # Los usuarios de prueba ya vienen verificados, para poder comprar.
    crud_user.mark_email_verified(db, client)
    client_id = client.user_id

    for direccion in datos["direcciones"]:
        crud_address.create_address(db, client_id, ShippingAddressCreate(**direccion))

    for tarjeta in datos["tarjetas"]:
        crud_payment.create_payment_method(db, client_id, PaymentMethodCreate(**tarjeta))

    if vencida := datos.get("tarjeta_vencida"):
        # La API no deja guardar una vencida: se inserta directo, como si
        # se hubiera cargado cuando estaba vigente.
        db.add(PaymentMethod(
            client_id=client_id,
            method=f"{vencida['card_type']} •••• {vencida['last_four']}",
            **vencida,
        ))
        db.commit()

    detalle = f"{len(datos['direcciones'])} dirección(es), {len(datos['tarjetas'])} tarjeta(s)"
    if datos.get("tarjeta_vencida"):
        detalle += " + 1 vencida"
    if items := datos.get("compra"):
        order_id = _crear_compra(db, client_id, items)
        detalle += f", compra #{order_id}" if order_id else ", sin compra (falta el catálogo)"

    return f"{cuenta.email} / {datos['cuenta']['password']}: {detalle}."


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for datos in USUARIOS:
            print(crear_usuario(db, datos))
    finally:
        db.close()


if __name__ == "__main__":
    main()
