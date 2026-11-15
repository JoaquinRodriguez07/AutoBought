"""Endpoint de Pit, el asistente de compra con IA."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.ia.assistant import new_history, recommend
from app.ia.client import AIClient, AIUnavailable, get_ai_client
from app.ia.signature import valid_signature, sign
from app.ia.service import check_limit, record_usage
from app.models.client import Client
from app.schemas.assistant import AssistantOut, AssistantRequest, build_assistant_out

router = APIRouter(prefix="/asistente", tags=["asistente"])
logger = logging.getLogger(__name__)

NO_DISPONIBLE = "El asistente no está disponible en este momento. Probá buscando el repuesto en el catálogo."
INVALID_CONVERSATION = "No pudimos seguir esta conversación. Empezá una nueva."


@router.post("", response_model=AssistantOut)
def ask_assistant(
    data: AssistantRequest,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
    ai_client: AIClient = Depends(get_ai_client),
):
    """El cliente cuenta qué le pasa al auto y recibe un diagnóstico y los
    repuestos compatibles con su vehículo. Pide sesión de cliente: cada
    consulta cuenta para el límite diario (429) y para el costo de la IA.
    Si la IA no responde, 503: el frontend ofrece buscar en el catálogo.

    Para seguir una conversación, el frontend manda el historial y la firma
    que devolvió la respuesta anterior. Si no coinciden (lo cambiaron, es de
    otro cliente o de otro auto), 400 y no se llama a la IA."""
    vehicle = (data.marca, data.modelo, data.anio)
    historial = [msg.model_dump() for msg in data.historial]

    if historial and not valid_signature(data.firma or "", client.user_id, *vehicle, historial):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CONVERSATION)

    check_limit(db, client.user_id)

    try:
        result, tokens = recommend(db, ai_client, data.texto, *vehicle, historial)
    except AIUnavailable as error:
        # Al cliente le llega un mensaje genérico; el motivo real queda en el
        # log del backend (docker logs backend) para poder arreglarlo.
        logger.warning("Pit no disponible: %s", error)
        record_usage(db, client.user_id, "asistente", tokens=0, ok=False)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NO_DISPONIBLE)

    record_usage(db, client.user_id, "asistente", tokens=tokens, ok=True)

    historial = new_history(historial, data.texto, result)
    return build_assistant_out(result, historial, sign(client.user_id, *vehicle, historial))
