from pydantic import BaseModel, Field

from app.models.cart import Cart


class CartItemCreate(BaseModel):
    part_id: int
    amount: int = Field(gt=0)


class CartItemUpdate(BaseModel):
    amount: int = Field(gt=0)


class CartItemOut(BaseModel):
    part_id: int
    amount: int


class CartCreate(BaseModel):
    items: list[CartItemCreate] = Field(default_factory=list)


class CartOut(BaseModel):
    client_id: int
    items: list[CartItemOut]


class CartItemDetailOut(BaseModel):
    part_id: int
    name: str
    price: int
    amount: int
    subtotal: int
    stock: int
    category: str


class CartDetailOut(BaseModel):
    client_id: int
    items: list[CartItemDetailOut]
    total: int


def build_cart_detail_out(cart: Cart) -> CartDetailOut:
    items = []
    total = 0

    for cart_item in cart.items:
        # El precio (y el stock) siempre se leen del Part actual: no se
        # guarda una copia en el carrito, así que si el precio cambia
        # después de agregarlo, el carrito ya muestra el nuevo.
        part = cart_item.part
        subtotal = part.price * cart_item.amount
        total += subtotal
        items.append(
            CartItemDetailOut(
                part_id=part.id,
                name=part.name,
                price=part.price,
                amount=cart_item.amount,
                subtotal=subtotal,
                stock=part.stock,
                category=part.category,
            )
        )

    return CartDetailOut(
        client_id=cart.client_id,
        items=items,
        total=total,
    )
