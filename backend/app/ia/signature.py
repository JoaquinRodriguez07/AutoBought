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
PURPOSE = "asistente-historial-v1"


def _content(user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> bytes:
    data = {
        "proposito": PURPOSE,
        "usuario": user_id,
        "vehiculo": [marca, modelo, anio],
        "historial": historial,
    }
    # Los mismos datos tienen que dar siempre exactamente los mismos bytes:
    # claves ordenadas y sin espacios.
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sign(user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> str:
    content = _content(user_id, marca, modelo, anio, historial)
    return hmac.new(SECRET_KEY.encode("utf-8"), content, hashlib.sha256).hexdigest()


def valid_signature(signature: str, user_id: int, marca: str, modelo: str, anio: int, historial: list[dict]) -> bool:
    expected = sign(user_id, marca, modelo, anio, historial)
    # compare_digest tarda lo mismo acierte o no, así no da pistas de cuántos
    # caracteres de la firma coinciden.
    return hmac.compare_digest(signature, expected)
