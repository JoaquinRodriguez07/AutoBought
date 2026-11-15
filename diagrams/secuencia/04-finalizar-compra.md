# Secuencia: finalizar compra

> **Implementado:** `POST /api/v1/orders` con body opcional
> `{ shipping_address_id, payment_method_id }` (lo que no se envía usa la dirección
> o el método principal del cliente) y la transacción `place_order()` de
> `backend/app/crud/order.py` (recuadro amarillo). El pedido nace en estado
> `confirmed` y guarda una copia de la dirección y del método de pago, para que el
> historial no cambie si el cliente los edita o borra.
>
> **Planificado (a confirmar con el equipo):** el cobro con la pasarela de pagos,
> con el orden "primero se reserva el stock y se crea el pedido, después se cobra".
> El estado del cobro iría en una entidad de pago aparte; el `status` del pedido es
> solo logístico (confirmado / enviado / entregado / cancelado). Hoy no se cobra.

```mermaid
---
config:
  theme: mc
---
sequenceDiagram
    autonumber
    actor C as Cliente

    box rgb(227,240,255) Frontend
        participant P as Pantallas<br/>(Carrito)
        participant S as Estado y Sesión<br/>(CartContext)
        participant A as Cliente API
    end

    box rgb(247,251,255) Backend
        participant R as API REST
        participant Seg as Seguridad
        participant L as Lógica de negocio<br/>(Pedidos)
    end

    participant DB as Base de Datos

    Note over P: "Finalizar compra" está deshabilitado<br/>si el carrito está vacío
    C->>P: "Finalizar compra"

    par Datos de envío y pago
        P->>A: obtenerDirecciones()
        A->>R: GET /api/v1/addresses
        R-->>A: direcciones
        A-->>P: direcciones
    and
        P->>A: obtenerMetodosPago()
        A->>R: GET /api/v1/payment-methods
        R-->>A: métodos de pago (con is_expired)
        A-->>P: métodos de pago
    end

    P-->>C: Modal de confirmación con la dirección y la tarjeta<br/>principales preseleccionadas (las vencidas no se pueden elegir)
    opt Sin direcciones o sin tarjetas vigentes
        P-->>C: "Agregar una dirección" / "Agregar una tarjeta"<br/>(confirmar queda deshabilitado)
    end

    C->>P: Elige dirección y tarjeta, y confirma
    P->>A: confirmarCompra({ direccionId, metodoPagoId })
    A->>R: POST /api/v1/orders (Bearer JWT)<br/>{ shipping_address_id, payment_method_id }
    R->>Seg: get_current_client(token)
    Seg->>DB: Buscar cliente por id (sub)

    alt Token ausente, inválido o vencido
        Seg-->>R: 401
        R-->>A: 401 "Token inválido o expirado."
    else El usuario no es cliente
        Seg-->>R: 403
        R-->>A: 403 "Esta acción requiere una cuenta de cliente."
    else Cliente válido
        Seg-->>R: cliente
        R->>DB: ROLLBACK (cierra la transacción de lectura de la autenticación)
        R->>L: place_order(client_id, dirección, método de pago)

        rect rgb(255,248,220)
            Note over L,DB: place_order() — una sola transacción
            L->>DB: BEGIN · SELECT cart + items FOR UPDATE

            alt Carrito inexistente o vacío
                L->>DB: ROLLBACK
                L-->>R: ValueError
                R-->>A: 400 "Tu carrito está vacío."
            else Carrito con items
                L->>DB: SELECT dirección y método de pago del cliente<br/>(los elegidos o, sin elegir, los principales)

                alt Sin dirección o sin método de pago guardado
                    L->>DB: ROLLBACK
                    L-->>R: ValueError
                    R-->>A: 400 "Agregá una dirección de envío /<br/>un método de pago para confirmar la compra."
                else Dirección o método inexistente o de otro cliente
                    L->>DB: ROLLBACK
                    L-->>R: ValueError
                    R-->>A: 422 "La dirección de envío / el método de pago<br/>elegido no es válido."
                else Tarjeta vencida
                    L->>DB: ROLLBACK
                    L-->>R: ValueError
                    R-->>A: 422 "La tarjeta elegida está vencida.<br/>Elegí otra o agregá una nueva."
                else Dirección y tarjeta válidas
                    L->>DB: SELECT part WHERE id IN (…) FOR UPDATE
                    DB-->>L: repuestos (bloqueados)

                    alt Algún repuesto ya no existe
                        L->>DB: ROLLBACK
                        L-->>R: ValueError
                        R-->>A: 409 "Algún repuesto del carrito ya no está disponible."
                    else Stock insuficiente
                        L->>DB: ROLLBACK
                        L-->>R: ValueError (repuesto, pedido, disponible)
                        R->>DB: SELECT part (nombre del repuesto)
                        R-->>A: 409 "No hay stock suficiente de 'X': pediste N, hay M."
                    else Stock suficiente
                        L->>DB: INSERT order (status = confirmed,<br/>copia de dirección y método de pago)<br/>INSERT order_item (frozen_price = precio actual)
                        L->>DB: UPDATE part.stock -= cantidad · DELETE cart_item
                        L->>DB: COMMIT
                        L-->>R: pedido
                        R->>R: build_order_detail_out (total con frozen_price)
                        R-->>A: 201 { order_id, created_at, status,<br/>shipping_address, payment_method, total, items }
                    end
                end
            end
        end
    end

    Note over P,A: Manejo de la respuesta en el frontend
    alt 201
        A->>A: mapearPedido
        A-->>P: pedido
        P-->>C: "¡Compra confirmada!" con el número de pedido
        P->>S: cargarCarrito()
        S->>A: GET /api/v1/cart
        A-->>S: carrito vacío
        S-->>C: Actualiza el carrito y el contador del Navbar
    else 400 / 401 / 403 / 409 / 422 / error de red
        A-->>P: error (mensaje del backend)
        P-->>C: Muestra el mensaje en el modal
    end
```
