"""Firma del historial de la conversación con el asistente.

El historial lo guarda el navegador y lo manda en cada mensaje, así el
backend no guarda conversaciones. Pero el navegador lo controla el usuario:
podría inventar mensajes "del asistente" para manipular a la IA (prompt
injection). Por eso el backend firma el historial que devuelve con
HMAC-SHA256 y una clave que solo él conoce (SECRET_KEY). Si alguien cambia
una coma, la firma ya no coincide y la conversación se rechaza.

La firma cubre también al cliente y al vehículo: no sirve usar la
conversación de otro cliente ni seguirla con otro auto.
"""

import hashlib
import hmac
import json

from app.core.config import SECRET_KEY

# Separa esta firma de cualquier otro uso de SECRET_KEY (por ejemplo, los
# tokens del login): una firma de acá nunca sirve para otra cosa.
PROPOSITO = "asistente-historial-v1"


def _contenido(user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> bytes:
    datos = {
        "proposito": PROPOSITO,
        "usuario": user_id,
        "vehiculo": [marca, modelo, anio],
        "historial": historial,
    }
    # Los mismos datos tienen que dar siempre exactamente los mismos bytes:
    # claves ordenadas y sin espacios.
    return json.dumps(datos, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def firmar(user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> str:
    contenido = _contenido(user_id, marca, modelo, anio, historial)
    return hmac.new(SECRET_KEY.encode("utf-8"), contenido, hashlib.sha256).hexdigest()


def firma_valida(firma: str, user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> bool:
    esperada = firmar(user_id, marca, modelo, anio, historial)
    # compare_digest tarda lo mismo acierte o no, así no da pistas de cuántos
    # caracteres de la firma coinciden.
    return hmac.compare_digest(firma, esperada)
