from datetime import datetime

from pydantic import BaseModel, Field

from app.models.order import Order, OrderStatus
from app.models.order_status_history import CancelReason
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


class OrderStatusStepOut(BaseModel):
    status: OrderStatus
    # None si no se sabe (pedidos de antes del historial de estados).
    changed_at: datetime | None


class OrderDetailOut(BaseModel):
    order_id: int
    created_at: datetime
    status: OrderStatus
    shipping_address: OrderShippingAddressOut
    payment_method: str
    # None en los pedidos de antes de Mercado Pago (ya cobrados con tarjeta).
    payment_status: PaymentStatus | None
    # Hasta cuándo se puede pagar; None en los pedidos de antes de Mercado Pago.
    payment_due_at: datetime | None
    total: int
    items: list[OrderItemDetailOut]
    # Los estados por los que pasó, del primero al actual.
    status_history: list[OrderStatusStepOut]
    # Solo en los cancelados, si se sabe por qué.
    cancel_reason: CancelReason | None


class OrderListOut(BaseModel):
    orders: list[OrderDetailOut]


def linea_de_tiempo(order: Order) -> list[OrderStatusStepOut]:
    """Los estados por los que pasó el pedido. Los de antes del historial
    (o los del seed) no tienen filas: se arma con la compra y el estado
    actual, que no se sabe cuándo cambió."""
    if order.status_history:
        return [
            OrderStatusStepOut(status=fila.status, changed_at=fila.changed_at)
            for fila in order.status_history
        ]
    pasos = [OrderStatusStepOut(status=OrderStatus.CONFIRMED, changed_at=order.created_at)]
    if order.status != OrderStatus.CONFIRMED:
        pasos.append(OrderStatusStepOut(status=order.status, changed_at=None))
    return pasos


def motivo_de_cancelacion(order: Order) -> CancelReason | None:
    if order.status != OrderStatus.CANCELLED:
        return None
    if order.status_history:
        motivo = order.status_history[-1].reason
        return CancelReason(motivo) if motivo else None
    # Sin historial: si el pago nunca se aprobó, venció sin pagarse.
    if order.payment is not None and order.payment.status != PaymentStatus.APPROVED:
        return CancelReason.EXPIRED
    return None


def build_order_detail_out(order: Order) -> OrderDetailOut:
    items = []

    for order_item in order.items:
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
        payment_due_at=order.payment.due_at if order.payment else None,
        total=order.total,
        items=items,
        status_history=linea_de_tiempo(order),
        cancel_reason=motivo_de_cancelacion(order),
    )
