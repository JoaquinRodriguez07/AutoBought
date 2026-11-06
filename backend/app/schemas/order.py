from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.crud.order import can_cancel, next_status
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
    # Hasta cuándo se puede pagar; None en los pedidos de antes de Mercado Pago.
    payment_due_at: datetime | None
    total: int
    items: list[OrderItemDetailOut]
    # Por qué lo canceló el vendedor; None si no lo canceló él.
    cancellation_reason: str | None = None


class OrderListOut(BaseModel):
    orders: list[OrderDetailOut]


# Lo que se pide al cancelar: lo lee el cliente en el mail.
MOTIVO_MIN = 5
MOTIVO_MAX = 200


class OrderStatusUpdate(BaseModel):
    """Body de PATCH /orders/{id}/status (portal del vendedor)."""

    status: OrderStatus
    # Obligatorio para cancelar; en los demás cambios se ignora.
    reason: str | None = Field(default=None, max_length=MOTIVO_MAX)

    @model_validator(mode="after")
    def motivo_al_cancelar(self):
        if self.status != OrderStatus.CANCELLED:
            self.reason = None
            return self
        self.reason = (self.reason or "").strip()
        if len(self.reason) < MOTIVO_MIN:
            raise ValueError(
                "Para cancelar un pedido hay que contar el motivo: le llega al cliente en el mail."
            )
        return self


class SellerOrderOut(OrderDetailOut):
    """Un pedido en el portal del vendedor: con el cliente y lo que se
    puede hacer con él (así la regla queda solo en el backend)."""

    client_name: str
    client_email: str
    client_phone: str | None
    # El pago en Mercado Pago, para buscarlo en su panel; None si no se pagó
    # o es de antes de Mercado Pago.
    mp_payment_id: str | None
    # El estado del botón "Pasar a ..."; None si no se puede avanzar.
    next_status: OrderStatus | None
    can_cancel: bool


class SellerOrderListOut(BaseModel):
    orders: list[SellerOrderOut]
    # Cuántos hay con el filtro elegido (para "Mostrar más").
    total: int
    # Cuántos hay en cada estado, sin filtro.
    counts: dict[OrderStatus, int]
    # Pagados y sin empezar a preparar: el aviso del menú.
    to_prepare: int


def build_seller_order_out(order: Order) -> SellerOrderOut:
    return SellerOrderOut(
        **build_order_detail_out(order).model_dump(),
        client_name=order.client.name,
        client_email=order.client.email,
        client_phone=order.client.phone,
        mp_payment_id=order.payment.mp_payment_id if order.payment else None,
        next_status=next_status(order),
        can_cancel=can_cancel(order),
    )


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
        cancellation_reason=order.cancellation_reason,
    )
