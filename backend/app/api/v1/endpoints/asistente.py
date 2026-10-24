from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.ia.asistente import recomendar
from app.ia.cliente import ClienteIA, IANoDisponible, get_cliente_ia
from app.ia.servicio import controlar_limite, registrar_uso
from app.models.client import Client
from app.schemas.asistente import AsistenteOut, AsistenteRequest, build_asistente_out

router = APIRouter(prefix="/asistente", tags=["asistente"])

NO_DISPONIBLE = "El asistente no está disponible en este momento. Probá buscando el repuesto en el catálogo."


@router.post("", response_model=AsistenteOut)
def consultar_asistente(
    data: AsistenteRequest,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    cliente_ia: ClienteIA = Depends(get_cliente_ia),
):
    """El cliente cuenta qué le pasa al auto y recibe un diagnóstico y los
    repuestos compatibles con su vehículo. Pide sesión de cliente: cada
    consulta cuenta para el límite diario (429) y para el costo de la IA.
    Si la IA no responde, 503: el frontend ofrece buscar en el catálogo."""
    controlar_limite(db, client.user_id)

    try:
        resultado, tokens = recomendar(db, cliente_ia, data.texto, data.marca, data.modelo, data.anio)
    except IANoDisponible:
        registrar_uso(db, client.user_id, "asistente", tokens=0, ok=False)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NO_DISPONIBLE)

    registrar_uso(db, client.user_id, "asistente", tokens=tokens, ok=True)
    return build_asistente_out(resultado)
