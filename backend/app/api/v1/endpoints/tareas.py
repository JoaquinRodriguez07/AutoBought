import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import CRON_SECRET
from app.core.notificaciones import TAREAS_DIARIAS

router = APIRouter(prefix="/tareas", tags=["tareas"])

_bearer_scheme = HTTPBearer(auto_error=False)


def _verificar_cron(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme)) -> None:
    """Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`. Sin el
    secreto configurado no se acepta ningún pedido."""
    if (
        not CRON_SECRET
        or credentials is None
        or not secrets.compare_digest(credentials.credentials, CRON_SECRET)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado.")


@router.get("/diarias", dependencies=[Depends(_verificar_cron)])
def correr_tareas_diarias(db: Session = Depends(get_db)) -> dict[str, int]:
    """Lo llama Vercel Cron una vez por día (ver backend/vercel.json).
    Devuelve cuántos mails mandó cada tarea."""
    return {nombre: tarea(db, None) for nombre, tarea in TAREAS_DIARIAS.items()}
