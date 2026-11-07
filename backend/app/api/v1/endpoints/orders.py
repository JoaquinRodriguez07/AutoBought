import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_current_employee, get_db
from app.core.mercadopago import (
    ClienteMercadoPago,
    MercadoPagoNoDisponible,
    get_cliente_mp,
    mercadopago_configurado,
)
from app.core.notificaciones import notificar_cambio_de_estado, notificar_vuelta_de_stock
from app.crud import order as crud_order
from app.crud import part as crud_part
from app.models.client import Client
from app.models.employee import Employee
from app.models.order import OrderStatus
from app.schemas.order import (
    OrderConfirm,
    OrderDetailOut,
    OrderListOut,
    OrderStatusUpdate,
    SellerOrderListOut,
    SellerOrderOut,
    SellerOrderUpdate,
    build_order_detail_out,
    build_seller_order_out,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])

def _detalle_sin_stock(db: Session, error: crud_order.SinStock) -> str:
    """El detalle del 409, con el nombre del repuesto si todavía existe."""
    part = crud_part.get_part(db, error.part_id)
    repuesto = f"'{part.name}'" if part is not None else f"el repuesto {error.part_id}"
    return (
        f"No hay stock suficiente de {repuesto}: "
        f"pediste {error.pedido}, hay {error.disponible}."
    )


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def confirm_order(
    body: OrderConfirm | None = None,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    if not client.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verificá tu correo para confirmar la compra. Te mandamos un enlace al registrarte.",
        )

    # Sin Mercado Pago el pedido no se podría pagar: se corta antes de
    # descontar el stock y vaciar el carrito.
    if not mercadopago_configurado():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Por ahora no podemos cobrar. Tu carrito quedó igual: probá de nuevo en un rato.",
        )

    client_id = client.user_id
    body = body or OrderConfirm()

    # Antes de mirar el stock, que vuelva el de los pedidos que no se pagaron a tiempo.
    crud_order.cancel_expired_orders(db)

    # place_order abre su propia transacción con `db.begin()`, y la
    # autenticación ya dejó una abierta al leer el cliente. Solo hubo
    # lecturas, así que el rollback no descarta nada.
    db.rollback()

    try:
        order = crud_order.place_order(
            db,
            client_id,
            shipping_address_id=body.shipping_address_id,
        )
    except crud_order.SinStock as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_detalle_sin_stock(db, error),
        )
    except crud_order.RepuestosNoEncontrados:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Algún repuesto del carrito ya no está disponible.",
        )
    except crud_order.SinDireccion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agregá una dirección de envío para confirmar la compra.",
        )
    except crud_order.DireccionNoEncontrada:
        # Una id inexistente o de otro cliente da el mismo 422.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La dirección de envío elegida no es válida.",
        )
    except crud_order.CarritoVacio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu carrito está vacío.",
        )

    # El mail de la compra sale cuando Mercado Pago aprueba el pago (ver pagos.py).
    return build_order_detail_out(order)


@router.get("", response_model=OrderListOut)
def list_orders(
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    client_id = client.user_id
    crud_order.cancel_expired_orders(db)
    orders = crud_order.list_order_by_client(db, client_id)
    return {
        "orders": [build_order_detail_out(order) for order in orders],
    }


# =====================================================
# Portal del vendedor
# =====================================================


@router.get(
    "/seller",
    response_model=SellerOrderListOut,
    dependencies=[Depends(get_current_employee)],
)
def list_orders_for_seller(
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    paid_only: bool = Query(default=False, description="Solo los pagados (los que se pueden preparar)."),
    sort: crud_order.SellerOrderSort = Query(
        default="priority",
        description="priority: en curso, el que más espera primero; cerrados, el más nuevo. "
        "O por fecha (newest, oldest), cliente (client_asc, client_desc) o total (total_desc, total_asc).",
    ),
    db: Session = Depends(get_db),
):
    """Los pedidos de todos los clientes. Va antes de /{order_id}: si no,
    FastAPI tomaría "seller" como un número de pedido."""
    crud_order.cancel_expired_orders(db)
    orders, total = crud_order.list_orders_for_seller(db, status_filter, limit, offset, paid_only, sort)
    return SellerOrderListOut(
        orders=[build_seller_order_out(order) for order in orders],
        total=total,
        counts=crud_order.count_orders_by_status(db),
        to_prepare=crud_order.count_orders_to_prepare(db),
    )


@router.get(
    "/seller/{order_id}",
    response_model=SellerOrderOut,
    dependencies=[Depends(get_current_employee)],
)
def get_order_for_seller(order_id: int, db: Session = Depends(get_db)):
    """El detalle de un pedido de cualquier cliente: productos, envío,
    cliente, pago y qué se puede hacer con él."""
    crud_order.cancel_expired_orders(db)
    order = crud_order.get_order_for_seller(db, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    return build_seller_order_out(order)


@router.patch("/seller/{order_id}", response_model=SellerOrderOut)
def update_order_for_seller(
    order_id: int,
    body: SellerOrderUpdate,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
):
    """El vendedor corrige un pedido a pedido del cliente: la dirección de
    envío (mientras no salió) y la nota interna (siempre). Productos y
    cantidades no se tocan: el pago ya se cobró por ese total."""
    order = crud_order.get_order_for_update(db, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")

    if body.shipping_address is not None:
        if not crud_order.can_edit_shipping(order):
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La dirección solo se puede cambiar antes de que el pedido se envíe.",
            )
        crud_order.update_shipping_address(order, body.shipping_address)
    if "internal_note" in body.model_fields_set:
        order.internal_note = body.internal_note

    db.commit()
    logger.info("El vendedor %s editó el pedido %s.", employee.user_id, order_id)
    return build_seller_order_out(order)


@router.patch("/{order_id}/status", response_model=SellerOrderOut)
def change_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    employee: Employee = Depends(get_current_employee),
    cliente_mp: ClienteMercadoPago = Depends(get_cliente_mp),
):
    """El vendedor avanza el pedido un paso (solo si está pagado), lo vuelve
    un paso atrás si se equivocó, o lo cancela con un motivo (solo si no se
    entregó). Cancelar devuelve el pago en Mercado Pago y el stock. El
    cliente recibe un mail al avanzar o cancelar; al volver atrás no, porque
    es corregir un error de la tienda."""
    order = crud_order.get_order_for_update(db, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")

    try:
        crud_order.check_status_change(order, body.status)
    except crud_order.InvalidStatusChange as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))

    volver = crud_order.is_step_back(order, body.status)
    if body.status == OrderStatus.CANCELLED:
        _devolver_pago(db, order, cliente_mp)

    crud_order.apply_status_change(db, order, body.status, body.reason)
    db.commit()
    logger.info(
        "El vendedor %s %s el pedido %s a %s.",
        employee.user_id, "volvió" if volver else "pasó", order_id, body.status.value,
    )

    if volver:
        return build_seller_order_out(order)
    if body.status == OrderStatus.CANCELLED:
        # Si algún repuesto estaba agotado, avisa a quienes lo esperaban.
        for item in order.items:
            notificar_vuelta_de_stock(db, item.part, item.part.stock - item.quantity, background_tasks)
    notificar_cambio_de_estado(order, background_tasks)
    return build_seller_order_out(order)


def _devolver_pago(db: Session, order, cliente_mp: ClienteMercadoPago) -> None:
    """Antes de cancelar un pedido pagado, se devuelve el pago. Si Mercado
    Pago falla, no se cancela nada: el vendedor lo reintenta (la clave de
    idempotencia hace que no se devuelva dos veces)."""
    payment = order.payment
    if payment is None:
        # Pedidos de antes de Mercado Pago: se cobraron con tarjeta en la tienda.
        logger.warning(
            "Pedido %s cancelado por el vendedor sin pago de Mercado Pago: devolver el dinero a mano.",
            order.order_id,
        )
        return
    try:
        cliente_mp.devolver_pago(payment.mp_payment_id, f"autobought-devolucion-pedido-{order.order_id}")
    except MercadoPagoNoDisponible as error:
        db.rollback()
        logger.warning("No se pudo devolver el pago del pedido %s: %s", order.order_id, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos devolver el pago en Mercado Pago, así que el pedido no se canceló. Probá de nuevo en un rato.",
        )


@router.get("/{order_id}", response_model=OrderDetailOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    client_id = client.user_id
    crud_order.cancel_expired_orders(db)
    order = crud_order.get_order_for_client(db, order_id, client_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )

    return build_order_detail_out(order)


@router.post("/{order_id}/recibido", response_model=OrderDetailOut)
def confirm_received(
    order_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    """«Ya lo recibí»: el cliente confirma que le llegó un pedido enviado.
    Pasa a «Entregado» y le llega el mail de la entrega."""
    order = crud_order.get_order_for_client(db, order_id, client.user_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )
    if not crud_order.confirm_received(db, order):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se puede confirmar la llegada de un pedido enviado.",
        )

    notificar_cambio_de_estado(order, background_tasks)
    return build_order_detail_out(order)
