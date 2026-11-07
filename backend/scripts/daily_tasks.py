"""Manda los recordatorios diarios (carritos abandonados y mantenimiento) y
reintenta las devoluciones de pagos que Mercado Pago no hizo en el momento.

Usage: python -m scripts.daily_tasks
       (en Docker: docker exec backend uv run python -m scripts.daily_tasks)

En producción no se usa este script: Vercel Cron llama a las mismas
tareas por GET /api/v1/tareas/diarias (ver el vercel.json de la raíz).

Se puede correr más de una vez: cada recordatorio se manda una sola vez
(ver app/core/notifications.py). Solo les llega a los clientes que no
se dieron de baja de los mails comerciales.
"""

from app.core.mercadopago import get_mp_client
from app.core.notifications import DAILY_TASKS
from app.crud import payment as crud_payment
from app.db.session import SessionLocal


def run(db) -> dict[str, int]:
    return {name_value: task(db, None) for name_value, task in DAILY_TASKS.items()}


def main():
    db = SessionLocal()
    try:
        for name_value, sent in run(db).items():
            print(f"{name_value}: {sent} mail(s) enviado(s).")
        print(f"Devoluciones hechas: {crud_payment.refund_pending(db, get_mp_client())}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
