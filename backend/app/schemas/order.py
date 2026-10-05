from datetime import datetime

from pydantic import BaseModel, Field

from app.models.order import Order


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


class OrderOut(BaseModel):
    order_id: int
    client_id: int
    items: list[OrderItemOut]


class OrderItemDetailOut(BaseModel):
    part_id: int
    name: str
    quantity: int
    frozen_price: int


class OrderDetailOut(BaseModel):
    order_id: int
    created_at: datetime
    total: int
    items: list[OrderItemDetailOut]


def build_order_detail_out(order: Order) -> OrderDetailOut:
    items = []
    total = 0

    for order_item in order.items:
        total += order_item.frozen_price * order_item.quantity
        items.append(
            OrderItemDetailOut(
                part_id=order_item.part_id,
                name=order_item.part.name,
                quantity=order_item.quantity,
                frozen_price=order_item.frozen_price,
            )
        )

    return OrderDetailOut(
        order_id=order.order_id,
        created_at=order.created_at,
        total=total,
        items=items,
    )
