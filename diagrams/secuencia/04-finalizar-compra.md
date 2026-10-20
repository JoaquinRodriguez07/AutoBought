# Secuencia: finalizar compra

> **Alcance actual:** confirmar la compra crea el pedido a partir del carrito,
> descuenta el stock y vacía el carrito, todo en una transacción
> (`place_order()` en `crud/order.py`). **Todavía no hay cobro:** no se elige
> método de pago ni dirección de envío, y no hay integración con una pasarela
> de pagos (planificada, ver el diagrama de componentes).

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
    P-->>C: Modal de confirmación
    C->>P: Confirma
    P->>A: confirmarCompra()
    A->>R: POST /api/v1/orders (Bearer JWT)
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
        R->>L: place_order(client_id)

        rect rgb(255,248,220)
            Note over L,DB: place_order() — una sola transacción
            L->>DB: BEGIN · SELECT cart + items FOR UPDATE

            alt Carrito inexistente o vacío
                L->>DB: ROLLBACK
                L-->>R: ValueError
                R-->>A: 400 "Tu carrito está vacío."
            else Carrito con items
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
                    L->>DB: INSERT order · INSERT order_item<br/>(frozen_price = precio actual)
                    L->>DB: UPDATE part.stock -= cantidad · DELETE cart_item
                    L->>DB: COMMIT
                    L-->>R: pedido
                    R->>R: build_order_detail_out (total con frozen_price)
                    R-->>A: 201 { order_id, created_at, total, items }
                end
            end
        end
    end

    Note over P,A: Manejo de la respuesta en el frontend
    alt 201
        A->>A: mapearPedido
        A-->>P: pedido
        P-->>C: Confirmación con el número de pedido
        P->>S: cargarCarrito()
        S->>A: GET /api/v1/cart
        A-->>S: carrito vacío
        S-->>C: Actualiza el carrito y el contador del Navbar
    else 400 / 401 / 403 / 409 / error de red
        A-->>P: error (mensaje del backend)
        P-->>C: Muestra el mensaje en el modal
    end
```
