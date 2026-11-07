"""Manda los recordatorios diarios (carritos abandonados y mantenimiento) y
reintenta las devoluciones de pagos que Mercado Pago no hizo en el momento.

Usage: python -m scripts.tareas_diarias
       (en Docker: docker exec backend uv run python -m scripts.tareas_diarias)

En producción no se usa este script: Vercel Cron llama a las mismas
tareas por GET /api/v1/tareas/diarias (ver el vercel.json de la raíz).

Se puede correr más de una vez: cada recordatorio se manda una sola vez
(ver app/core/notificaciones.py). Solo les llega a los clientes que no
se dieron de baja de los mails comerciales.
"""

from app.core.mercadopago import get_cliente_mp
from app.core.notificaciones import TAREAS_DIARIAS
from app.crud import payment as crud_payment
from app.db.session import SessionLocal


def correr(db) -> dict[str, int]:
    return {nombre: tarea(db, None) for nombre, tarea in TAREAS_DIARIAS.items()}


def main():
    db = SessionLocal()
    try:
        for nombre, enviados in correr(db).items():
            print(f"{nombre}: {enviados} mail(s) enviado(s).")
        print(f"Devoluciones hechas: {crud_payment.devolver_pendientes(db, get_cliente_mp())}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
