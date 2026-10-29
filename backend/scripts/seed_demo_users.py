"""Crea clientes y un vendedor de prueba. Los clientes traen direcciones ya
cargadas.

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
| ana.perez@autobought.com        | Repuestos2026 | 2 direcciones, una compra pagada               |
| martin.rodriguez@autobought.com | Motor2026x    | Dirección en Maldonado                         |
| lucia.fernandez@autobought.com  | Frenos2026x   | Dirección en el interior con apto. y S/N       |
| vendedor@autobought.com         | Ventas2026x   | Vendedor (rol employee): entra a /dashboard    |

Los pagos se hacen en Mercado Pago, con las tarjetas de prueba de la
cuenta de prueba: la tienda no guarda tarjetas.
"""

from sqlalchemy import select

from app.core import validators
from app.core.security import hash_password
from app.crud import cart as crud_cart
from app.crud import order as crud_order
from app.crud import shipping_address as crud_address
from app.crud import user as crud_user
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.part import Part
from app.models.payment import PaymentStatus
from app.schemas.auth import RegisterRequest
from app.schemas.shipping_address import ShippingAddressCreate
import app.models

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
    },
]

# Vendedores (rol employee). La contraseña pasa por la misma regla que la de
# los clientes (no puede contener la parte local del correo, por eso no es
# "Vendedor...").
VENDEDORES = [
    {
        "name": "Vendedor AutoBought",
        "email": "vendedor@autobought.com",
        "password": "Ventas2026x",
    },
]


def _crear_compra(db, client_id: int, items: list[tuple[str, int]]) -> int | None:
    """Arma un carrito con un repuesto de cada categoría y lo compra, ya
    pagado (como si Mercado Pago hubiera aprobado el pago)."""
    for categoria, cantidad in items:
        part = db.scalar(
            select(Part).where(Part.category == categoria, Part.stock >= cantidad).limit(1)
        )
        if part is None:
            return None
        crud_cart.add_item(db, client_id, part.id, cantidad)

    # place_order abre su propia transacción (igual que en el endpoint).
    db.rollback()
    order = crud_order.place_order(db, client_id)
    order.payment.status = PaymentStatus.APPROVED
    db.commit()
    return order.order_id


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

    detalle = f"{len(datos['direcciones'])} dirección(es)"
    if items := datos.get("compra"):
        order_id = _crear_compra(db, client_id, items)
        detalle += f", compra #{order_id}" if order_id else ", sin compra (falta el catálogo)"

    return f"{cuenta.email} / {datos['cuenta']['password']}: {detalle}."


def crear_vendedor(db, datos: dict) -> str:
    email = datos["email"]
    password = validators.password_segura(datos["password"], email)

    if crud_user.get_user_by_email(db, email):
        return f"{email}: ya existe, se saltea."

    crud_user.create_employee(
        db,
        name=datos["name"],
        email=email,
        password_hash=hash_password(password),
    )
    return f"{email} / {password}: vendedor."


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for datos in USUARIOS:
            print(crear_usuario(db, datos))
        for datos in VENDEDORES:
            print(crear_vendedor(db, datos))
    finally:
        db.close()


if __name__ == "__main__":
    main()
