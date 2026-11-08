"""Endpoint de las tareas diarias que llama Vercel Cron."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import AI_SUMMARY_HISTORY_DAYS, CRON_SECRET
from app.core.mercadopago import MercadoPagoClient, get_mp_client
from app.core.notifications import DAILY_TASKS
from app.crud import dashboard_summary as crud_summary
from app.crud import payment as crud_payment
from app.crud.order import cancel_expired_orders

router = APIRouter(prefix="/tareas", tags=["tareas"])

_bearer_scheme = HTTPBearer(auto_error=False)


def _verify_cron(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> None:
    """Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`. Sin el
    secreto configurado no se acepta ningún pedido."""
    if (
        not CRON_SECRET
        or credentials is None
        or not secrets.compare_digest(credentials.credentials, CRON_SECRET)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado.")


@router.get("/diarias", dependencies=[Depends(_verify_cron)])
def run_daily_tasks(
    db: Session = Depends(get_db),
    mp_client: MercadoPagoClient = Depends(get_mp_client),
) -> dict[str, int]:
    """Lo llama Vercel Cron una vez por día (ver el vercel.json de la raíz).
    Devuelve cuántos mails mandó cada tarea, cuántos pedidos sin pagar
    canceló la limpieza (de respaldo: también se cancelan al comprar y al
    ver el historial) y cuántas devoluciones pendientes salieron (las de
    pagos tardíos sin stock que Mercado Pago no devolvió en el momento).
    También borra los resúmenes del dashboard que ya salieron del historial."""
    result = {name_value: task(db, None) for name_value, task in DAILY_TASKS.items()}
    result["Pedidos vencidos cancelados"] = cancel_expired_orders(db)
    result["Devoluciones hechas"] = crud_payment.refund_pending(db, mp_client)
    result["Resúmenes viejos borrados"] = crud_summary.delete_older_than(db, AI_SUMMARY_HISTORY_DAYS)
    return result
