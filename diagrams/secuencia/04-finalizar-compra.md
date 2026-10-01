# Secuencia: finalizar compra *(planificado)*

> **Estado actual:** el botón "FINALIZAR COMPRA" de `Carrito.jsx` todavía no tiene
> acción y no existe ningún endpoint de pedidos. Lo único implementado es la
> transacción `place_order()` en `backend/app/crud/order.py` (recuadro amarillo
> en el diagrama).
>
> **Propuesto (a confirmar con el equipo):** el endpoint `POST /api/v1/orders`, los
> códigos de respuesta (400 / 409 / 402 / 201), la integración con la pasarela y el
> orden "primero se reserva el stock y se crea el pedido, después se cobra". Con ese
> orden nunca se cobra un pedido que no se puede cumplir, pero un pago rechazado
> obliga a deshacer el pedido. `Order` todavía no tiene un campo de estado
> (pendiente / pagado / cancelado), así que cómo representar eso es una decisión
> pendiente.

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
        participant A as Cliente API
    end

    box rgb(247,251,255) Backend
        participant R as API REST
        participant Seg as Seguridad
        participant L as Lógica de negocio<br/>(Pedidos · Pagos)
    end

    participant DB as Base de Datos
    participant PG as Pasarela de Pagos

    C->>P: "Finalizar compra"
    P->>A: Confirmar pedido
    A->>R: POST /api/v1/orders (Bearer JWT)
    R->>Seg: get_current_client(token)
    Note over R,Seg: 401 / 403 igual que en el diagrama 03
    Seg-->>R: cliente

    R->>L: place_order(client_id)
    rect rgb(255,248,220)
        Note over L,DB: place_order() — implementado en crud/order.py
        L->>DB: BEGIN · SELECT cart + items FOR UPDATE

        alt Carrito inexistente o vacío
            L->>DB: ROLLBACK
            L-->>R: error
            R-->>A: 400 El carrito está vacío
        else Carrito con items
            L->>DB: SELECT part WHERE id IN (…) FOR UPDATE
            DB-->>L: repuestos (bloqueados)

            alt Repuesto inexistente o stock insuficiente
                L->>DB: ROLLBACK
                L-->>R: error
                R-->>A: 409 No hay stock suficiente
            else Stock suficiente
                L->>DB: INSERT order · INSERT order_item<br/>(frozen_price = precio actual)
                L->>DB: UPDATE part.stock -= cantidad · DELETE cart_item
                L->>DB: COMMIT
                L-->>R: pedido
            end
        end
    end

    opt Pedido creado
        R->>L: Procesar pago (total del pedido)
        L->>PG: Solicitar cobro
        PG-->>L: Resultado del pago

        alt Pago aprobado
            L-->>R: aprobado
            R-->>A: 201 { order }
        else Pago rechazado
            L->>DB: Cancelar pedido y devolver stock (compensación)
            L-->>R: rechazado
            R-->>A: 402 Pago rechazado
        end
    end

    alt 201
        A-->>P: pedido
        P-->>C: Confirmación de compra
    else 400 / 402 / 409
        A-->>P: error
        P-->>C: Informa el motivo
    end
```
