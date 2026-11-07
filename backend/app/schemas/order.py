from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.crud.order import can_cancel, can_edit_shipping, next_status, previous_status
from app.models.order import Order, OrderStatus
from app.models.order_status_history import CancelReason
from app.models.payment import PaymentStatus
from app.schemas.shipping_address import ShippingAddressCreate


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
    # El texto que escribió el vendedor al cancelar (va en el mail); None si no lo canceló él.
    cancellation_reason: str | None = None


class OrderListOut(BaseModel):
    orders: list[OrderDetailOut]


def timeline(order: Order) -> list[OrderStatusStepOut]:
    """Los estados por los que pasó el pedido. Los de antes del historial
    (o los del seed) no tienen filas: se arma con la compra y el estado
    actual, que no se sabe cuándo cambió."""
    if order.status_history:
        return [
            OrderStatusStepOut(status=row.status, changed_at=row.changed_at)
            for row in order.status_history
        ]
    steps = [OrderStatusStepOut(status=OrderStatus.CONFIRMED, changed_at=order.created_at)]
    if order.status != OrderStatus.CONFIRMED:
        steps.append(OrderStatusStepOut(status=order.status, changed_at=None))
    return steps


def cancel_reason_of(order: Order) -> CancelReason | None:
    if order.status != OrderStatus.CANCELLED:
        return None
    if order.status_history:
        motivo = order.status_history[-1].reason
        return CancelReason(motivo) if motivo else None
    # Sin historial: si el pago nunca se aprobó, venció sin pagarse.
    if order.payment is not None and order.payment.status != PaymentStatus.APPROVED:
        return CancelReason.EXPIRED
    return None


# Lo que se pide al cancelar: lo lee el cliente en el mail.
REASON_MIN = 5
REASON_MAX = 200


class OrderStatusUpdate(BaseModel):
    """Body de PATCH /orders/{id}/status (portal del vendedor)."""

    status: OrderStatus
    # Obligatorio para cancelar; en los demás cambios se ignora.
    reason: str | None = Field(default=None, max_length=REASON_MAX)

    @model_validator(mode="after")
    def reason_when_cancelling(self):
        if self.status != OrderStatus.CANCELLED:
            self.reason = None
            return self
        self.reason = (self.reason or "").strip()
        if len(self.reason) < REASON_MIN:
            raise ValueError(
                "Para cancelar un pedido hay que contar el motivo: le llega al cliente en el mail."
            )
        return self


NOTE_MAX = 500


class OrderShippingAddressIn(ShippingAddressCreate):
    """La dirección corregida por el vendedor: las mismas reglas que cuando
    el cliente la carga en su perfil (sin "principal", que acá no aplica)."""

    is_primary: bool = Field(default=False, exclude=True)


class SellerOrderUpdate(BaseModel):
    """Body de PATCH /orders/seller/{id}: lo que el vendedor corrige a pedido
    del cliente. Lo que no se manda queda igual."""

    shipping_address: OrderShippingAddressIn | None = None
    # Vacía o solo espacios: se borra la nota.
    internal_note: str | None = Field(default=None, max_length=NOTE_MAX)

    @model_validator(mode="after")
    def something_to_change(self):
        if not self.model_fields_set & {"shipping_address", "internal_note"}:
            raise ValueError("Mandá la dirección de envío o la nota interna.")
        if "shipping_address" in self.model_fields_set and self.shipping_address is None:
            raise ValueError("La dirección de envío no se puede borrar.")
        if self.internal_note is not None:
            self.internal_note = self.internal_note.strip() or None
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
    # Cuándo se le devolvió el dinero; None si no se devolvió.
    refunded_at: datetime | None
    # Pagado y cancelado, pero el dinero todavía no se devolvió (Mercado Pago
    # falló; el cron lo reintenta cada día).
    refund_pending: bool
    # El estado del botón "Pasar a ..."; None si no se puede avanzar.
    next_status: OrderStatus | None
    # A dónde vuelve si el vendedor se equivocó; None si no se puede volver.
    previous_status: OrderStatus | None
    can_cancel: bool
    # La dirección se corrige mientras el pedido no salió.
    can_edit_shipping: bool
    # Solo para la tienda: no va en OrderDetailOut (lo que ve el cliente).
    internal_note: str | None


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
        refunded_at=order.payment.refunded_at if order.payment else None,
        refund_pending=(
            order.payment is not None
            and order.status == OrderStatus.CANCELLED
            and order.payment.status == PaymentStatus.APPROVED
            and order.payment.refunded_at is None
        ),
        next_status=next_status(order),
        previous_status=previous_status(order),
        can_cancel=can_cancel(order),
        can_edit_shipping=can_edit_shipping(order),
        internal_note=order.internal_note,
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
        status_history=timeline(order),
        cancel_reason=cancel_reason_of(order),
        cancellation_reason=order.cancellation_reason,
    )
