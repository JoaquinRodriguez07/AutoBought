# Secuencia: finalizar compra

> **Implementado:** la compra tiene dos pasos. Primero `POST /api/v1/orders`
> (body opcional `{ shipping_address_id, delivery_method }`) arma el pedido con la
> transacción `place_order()` de `backend/app/crud/order.py` (recuadro amarillo):
> descuenta el stock y vacía el carrito, y el pedido nace `confirmed` con su
> **pago pendiente** (entidad `payment` aparte). Después el cliente paga en
> **Mercado Pago (Checkout Pro)**: `POST /api/v1/pagos/{id}` da el link, y el pago
> se confirma al volver a `/pago` (`POST /api/v1/pagos/{id}/verificar`) o por el
> aviso de Mercado Pago (`POST /api/v1/pagos/webhook`), lo que llegue primero.
> En los dos casos no se le cree al aviso: se consulta el pago a Mercado Pago.
>
> El stock queda reservado `MINUTOS_PARA_PAGAR` minutos (15 por defecto). Si el
> pedido no se paga a tiempo, `cancel_expired_orders()` lo cancela y devuelve el
> stock; si el pago se aprueba igual después, se le devuelve el dinero.
> El `status` del pedido es solo logístico; el estado del cobro vive en `payment`.

```mermaid
---
config:
  theme: mc
---
sequenceDiagram
    autonumber
    actor C as Cliente

    box rgb(227,240,255) Frontend
        participant P as Pantallas<br/>(Carrito · Resultado del pago)
        participant S as Estado y Sesión<br/>(CartContext)
        participant A as Cliente API
    end

    box rgb(247,251,255) Backend
        participant R as API REST<br/>(/orders · /pagos)
        participant Seg as Seguridad
        participant L as Lógica de negocio<br/>(Pedidos · Pagos)
    end

    participant DB as Base de Datos
    participant MP as Mercado Pago

    Note over P: "Finalizar compra" está deshabilitado<br/>si el carrito está vacío
    C->>P: "Finalizar compra"

    par Datos de entrega
        P->>A: getAddresses()
        A->>R: GET /api/v1/addresses
        R-->>A: direcciones
    and
        P->>A: getPickupInfo()
        A->>R: GET /api/v1/orders/pickup-info
        R-->>A: dirección y horario del local
    end
    P-->>C: Modal: envío a domicilio (dirección principal preseleccionada)<br/>o retiro en el local

    C->>P: Elige y confirma
    P->>A: confirmPurchase({ idAddress, deliveryMethod })
    A->>R: POST /api/v1/orders (Bearer JWT)<br/>{ shipping_address_id, delivery_method }
    R->>Seg: get_current_client(token)

    alt Token inválido / no es cliente / correo sin verificar
        R-->>A: 401 / 403
    else Mercado Pago sin configurar (o retiro sin datos del local)
        R-->>A: 503 "Por ahora no podemos cobrar…"
    else Cliente válido
        R->>L: cancel_expired_orders() (devuelve el stock de los vencidos)
        R->>L: place_order(client_id, dirección, delivery_method)

        rect rgb(255,248,220)
            Note over L,DB: place_order() — una sola transacción
            L->>DB: BEGIN · SELECT cart + items FOR UPDATE
            alt Carrito vacío / sin dirección
                L->>DB: ROLLBACK
                R-->>A: 400 "Tu carrito está vacío." / "Agregá una dirección…"
            else Dirección de otro cliente o inexistente
                L->>DB: ROLLBACK
                R-->>A: 422 "La dirección de envío elegida no es válida."
            else Repuesto inexistente o stock insuficiente
                L->>DB: SELECT part … FOR UPDATE
                L->>DB: ROLLBACK
                R-->>A: 409 "No hay stock suficiente de 'X': pediste N, hay M."
            else Todo bien
                L->>DB: SELECT part … FOR UPDATE
                L->>DB: INSERT order (confirmed, copia de la dirección)<br/>INSERT payment (pending) · INSERT order_item (frozen_price)
                L->>DB: UPDATE part.stock -= cantidad · DELETE cart_item
                L->>DB: COMMIT
                R-->>A: 201 { order_id, status, items, total, … }
            end
        end
    end

    alt 201
        A-->>P: pedido
        P->>S: loadCart() (el carrito ya quedó vacío)
        P->>A: createPaymentLink(orderId)
        A->>R: POST /api/v1/pagos/{orderId}
        R->>L: cancel_expired_orders() · buscar el pago del cliente
        alt Pago pendiente con link vivo
            R->>MP: GET preferencia existente
        else Primer intento o reintento tras un rechazo
            R->>MP: POST preferencia (items, external_reference = pedido,<br/>back_urls a /pago, vence con el plazo, sin efectivo)
            R->>DB: guardar mp_preference_id
        end
        MP-->>R: link de checkout
        R-->>A: { url }
        A-->>P: url
        P-->>C: Redirige a Mercado Pago
        Note over A,P: Si el link falla (409 ya pagado / cancelado, 503),<br/>el pedido queda creado y se puede reintentar
    else 400 / 401 / 403 / 409 / 422 / 503
        A-->>P: error (mensaje del backend)
        P-->>C: Muestra el mensaje en el modal
    end

    C->>MP: Paga con tarjeta en el checkout

    par El cliente vuelve al sitio
        MP-->>C: Redirige a /pago?pedido={id}&payment_id=…
        C->>P: Resultado del pago
        P->>A: verifyPayment(orderId, paymentId)
        A->>R: POST /api/v1/pagos/{orderId}/verificar (Bearer JWT)
        R->>MP: GET pago {payment_id}
        MP-->>R: estado, monto, external_reference
        R->>L: apply_mp_status() (si el pago es de este pedido)
        L->>DB: UPDATE payment (approved / rejected / pending)
        R-->>A: { estado }
        A-->>P: estado
        P-->>C: "Pago aprobado" / "en proceso" / "rechazado" (reintentar)
    and Aviso de Mercado Pago (respaldo, solo en producción)
        MP->>R: POST /api/v1/pagos/webhook (firma x-signature)
        R->>R: valid_signature() (401 si no la firmó Mercado Pago)
        R->>MP: GET pago {id}
        MP-->>R: estado, monto, external_reference
        R->>L: apply_mp_status()
        L->>DB: UPDATE payment
        R-->>MP: 200
    end

    Note over R,MP: Al aprobarse (una sola vez): mail de la compra. Si el pedido ya<br/>se había cancelado por vencido, o el monto no coincide, se devuelve el dinero.
```
