"""Aprueba el pago de un pedido como lo haría Mercado Pago. Solo para el E2E.

En el CI no hay Mercado Pago real: el recorrido completo de la demo
(e2e/tests/full-journey.spec.js) compra, y este script hace lo que haría el
aviso de un pago aprobado, con la MISMA función que usa el webhook
(`crud.payment.apply_mp_status`), y manda el mail de confirmación. Así el
pedido queda pagado y el vendedor lo puede preparar.

Aprueba pagos sin cobrar nada, así que solo corre con E2E_APROBAR_PAGOS=1, que
pone solo el E2E: corrido por error contra producción, no hace nada.

    E2E_APROBAR_PAGOS=1 uv run python -m scripts.e2e_approve_payment <número de pedido>
"""

import argparse
import os
import sys

from app.core.notifications import notify_purchase
from app.crud import payment as crud_payment
from app.db.session import SessionLocal
from app.models.order import Order


def approve(order_id: int) -> str:
    """Aprueba el pago pendiente del pedido `order_id`.

    Args:
        order_id: el número de pedido.

    Returns:
        Qué pasó, en una línea para el log del test.

    Raises:
        SystemExit: si el pedido no existe o el pago no quedó aprobado.
    """
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if order is None:
            sys.exit(f"No existe el pedido #{order_id}.")
        payment, just_approved = crud_payment.apply_mp_status(
            db, order_id, f"e2e-{order_id}", "approved", float(order.total)
        )
        if payment is None or not just_approved:
            sys.exit(f"El pago del pedido #{order_id} no quedó aprobado.")
        notify_purchase(payment.order)
        return f"Pedido #{order_id}: pago aprobado."
    finally:
        db.close()


def main() -> None:
    if os.getenv("E2E_APROBAR_PAGOS") != "1":
        sys.exit("Solo para el E2E: falta E2E_APROBAR_PAGOS=1. No se aprobó nada.")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("pedido", type=int, help="número de pedido")
    print(approve(parser.parse_args().pedido))


if __name__ == "__main__":
    main()
