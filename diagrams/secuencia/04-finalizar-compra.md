# Secuencia: finalizar compra

> **Implementado:** `POST /api/v1/orders` con body opcional
> `{shipping_address_id, payment_method_id}` (sin elegir, usa los principales) y la
> transacción `place_order()` de `backend/app/crud/order.py` (recuadro amarillo). El
> pedido nace en estado `confirmed` y guarda una copia de la dirección y del método de
> pago, para que el historial no cambie si el cliente los edita o borra.
>
> **Planificado (a confirmar con el equipo):** la integración con la pasarela (bloque
> "Pedido creado"), con el orden "primero se reserva el stock y se crea el pedido,
> después se cobra". El estado del cobro iría en una entidad de pago aparte; el
> `status` del pedido es solo logístico (confirmado / enviado / entregado / cancelado).

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

    R->>L: place_order(client_id, dirección?, método de pago?)
    rect rgb(255,248,220)
        Note over L,DB: place_order() — implementado en crud/order.py
        L->>DB: BEGIN · SELECT cart + items FOR UPDATE

        alt Carrito inexistente o vacío
            L->>DB: ROLLBACK
            L-->>R: error
            R-->>A: 400 El carrito está vacío
        else Carrito con items
            L->>DB: SELECT dirección y método de pago<br/>(elegidos o principales, del cliente)

            alt Sin dirección o sin método de pago guardado
                L->>DB: ROLLBACK
                L-->>R: error
                R-->>A: 400 Agregá una dirección / un método de pago
            else Dirección o método de otro cliente
                L->>DB: ROLLBACK
                L-->>R: error
                R-->>A: 422 La dirección / el método elegido no es válido
            end

            L->>DB: SELECT part WHERE id IN (…) FOR UPDATE
            DB-->>L: repuestos (bloqueados)

            alt Repuesto inexistente o stock insuficiente
                L->>DB: ROLLBACK
                L-->>R: error
                R-->>A: 409 No hay stock suficiente
            else Stock suficiente
                L->>DB: INSERT order (status = confirmed,<br/>copia de dirección y método de pago)<br/>INSERT order_item (frozen_price = precio actual)
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
    else 400 / 402 / 409 / 422
        A-->>P: error
        P-->>C: Informa el motivo
    end
```
