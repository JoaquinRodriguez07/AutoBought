from datetime import datetime

from pydantic import BaseModel, Field

from app.models.order import Order, OrderStatus
from app.models.payment import PaymentStatus


class OrderItemCreate(BaseModel):
    part_id: int
    quantity: int = Field(gt=0)
    frozen_price: int


class OrderItemOut(BaseModel):
    part_id: int
    quantity: int
    frozen_price: int


class OrderCreate(BaseModel):
    client_id: int
    items: list[OrderItemCreate] = Field(default_factory=list)


class OrderConfirm(BaseModel):
    """Body opcional de POST /orders; sin dirección, usa la principal."""

    shipping_address_id: int | None = None


class OrderOut(BaseModel):
    order_id: int
    client_id: int
    items: list[OrderItemOut]


class OrderItemDetailOut(BaseModel):
    part_id: int
    part_code: str
    name: str
    quantity: int
    frozen_price: int


class OrderShippingAddressOut(BaseModel):
    personal_name: str
    street: str
    number: str
    apartment: str | None
    city: str
    department: str
    postal_code: str | None


class OrderDetailOut(BaseModel):
    order_id: int
    created_at: datetime
    status: OrderStatus
    shipping_address: OrderShippingAddressOut
    payment_method: str
    # None en los pedidos de antes de Mercado Pago (ya cobrados con tarjeta).
    payment_status: PaymentStatus | None
    total: int
    items: list[OrderItemDetailOut]


class OrderListOut(BaseModel):
    orders: list[OrderDetailOut]


def build_order_detail_out(order: Order) -> OrderDetailOut:
    items = []
    total = 0

    for order_item in order.items:
        total += order_item.frozen_price * order_item.quantity
        items.append(
            OrderItemDetailOut(
                part_id=order_item.part_id,
                part_code=order_item.part.part_code,
                name=order_item.part.name,
                quantity=order_item.quantity,
                frozen_price=order_item.frozen_price,
            )
        )

    return OrderDetailOut(
        order_id=order.order_id,
        created_at=order.created_at,
        status=order.status,
        shipping_address=OrderShippingAddressOut(
            personal_name=order.ship_personal_name,
            street=order.ship_street,
            number=order.ship_number,
            apartment=order.ship_apartment,
            city=order.ship_city,
            department=order.ship_department,
            postal_code=order.ship_postal_code,
        ),
        payment_method=order.payment_method_label,
        payment_status=order.payment.status if order.payment else None,
        total=total,
        items=items,
    )
