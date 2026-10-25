from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.ia.asistente import nuevo_historial, recomendar
from app.ia.cliente import ClienteIA, IANoDisponible, get_cliente_ia
from app.ia.firma import firma_valida, firmar
from app.ia.servicio import controlar_limite, registrar_uso
from app.models.client import Client
from app.schemas.asistente import AsistenteOut, AsistenteRequest, build_asistente_out

router = APIRouter(prefix="/asistente", tags=["asistente"])

NO_DISPONIBLE = "El asistente no está disponible en este momento. Probá buscando el repuesto en el catálogo."
CONVERSACION_INVALIDA = "No pudimos seguir esta conversación. Empezá una nueva."


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
    Si la IA no responde, 503: el frontend ofrece buscar en el catálogo.

    Para seguir una conversación, el frontend manda el historial y la firma
    que devolvió la respuesta anterior. Si no coinciden (lo cambiaron, es de
    otro cliente o de otro auto), 400 y no se llama a la IA."""
    vehiculo = (data.marca, data.modelo, data.anio)
    historial = [mensaje.model_dump() for mensaje in data.historial]

    if historial and not firma_valida(data.firma or "", client.user_id, *vehiculo, historial):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CONVERSACION_INVALIDA)

    controlar_limite(db, client.user_id)

    try:
        resultado, tokens = recomendar(db, cliente_ia, data.texto, *vehiculo, historial)
    except IANoDisponible:
        registrar_uso(db, client.user_id, "asistente", tokens=0, ok=False)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NO_DISPONIBLE)

    registrar_uso(db, client.user_id, "asistente", tokens=tokens, ok=True)

    historial = nuevo_historial(historial, data.texto, resultado)
    return build_asistente_out(resultado, historial, firmar(client.user_id, *vehiculo, historial))
