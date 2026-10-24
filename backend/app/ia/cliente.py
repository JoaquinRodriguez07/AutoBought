"""Cliente del modelo de IA (Gemini, Interactions API).

Es el único lugar del backend que habla con el proveedor: las
funcionalidades (el asistente de compra, el dashboard) piden texto con
`ClienteIA.generar` y no saben qué API hay detrás. En los tests se
reemplaza por un cliente falso (ver `get_cliente_ia`): el CI nunca llama a
la IA real.
"""

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import GEMINI_API_KEY, GEMINI_MODEL, IA_TIMEOUT_SEGUNDOS

URL_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions"


class IANoDisponible(Exception):
    """La IA no se puede usar ahora: falta la clave, no respondió a tiempo,
    devolvió un error o una respuesta que no sirve. Cada funcionalidad lo
    maneja con un plan B y un mensaje claro."""


@dataclass
class RespuestaIA:
    texto: str
    tokens: int = 0


class ClienteIA(Protocol):
    def generar(self, instrucciones: str, entrada: str) -> RespuestaIA: ...


def extraer_texto(respuesta: dict) -> str:
    """El texto final de la respuesta. Se ignoran los pasos de "pensamiento"
    y se aceptan las dos formas de la API: `steps[].content[]` con
    `type: "text"` (Interactions) y `candidates[].content.parts[].text`
    (generateContent)."""
    partes: list[str] = []

    def recorrer(nodo, en_pensamiento: bool) -> None:
        if isinstance(nodo, list):
            for hijo in nodo:
                recorrer(hijo, en_pensamiento)
            return
        if not isinstance(nodo, dict):
            return
        pensamiento = en_pensamiento or nodo.get("type") == "thought" or nodo.get("thought") is True
        texto = nodo.get("text")
        es_texto = nodo.get("type") == "text" or ("text" in nodo and "type" not in nodo)
        if not pensamiento and es_texto and isinstance(texto, str):
            partes.append(texto)
            return
        for clave, hijo in nodo.items():
            if clave != "text":
                recorrer(hijo, pensamiento)

    recorrer(respuesta.get("steps") or respuesta.get("candidates") or [], False)
    return "".join(partes).strip()


def extraer_tokens(respuesta: dict) -> int:
    uso = respuesta.get("usage") or {}
    if "total_tokens" in uso:
        return int(uso["total_tokens"])
    uso = respuesta.get("usageMetadata") or {}
    return int(uso.get("totalTokenCount", 0))


class ClienteGemini:
    def __init__(
        self,
        clave: str = GEMINI_API_KEY,
        modelo: str = GEMINI_MODEL,
        timeout: float = IA_TIMEOUT_SEGUNDOS,
        transport: httpx.BaseTransport | None = None,
    ):
        self.clave = clave
        self.modelo = modelo
        self.timeout = timeout
        # Solo para los tests: un transporte falso en vez de la red.
        self.transport = transport

    def generar(self, instrucciones: str, entrada: str) -> RespuestaIA:
        if not self.clave:
            raise IANoDisponible("No hay clave de IA configurada.")

        pedido = {
            "model": self.modelo,
            "system_instruction": instrucciones,
            "input": entrada,
            "store": False,
            "generation_config": {"thinking_level": "low", "max_output_tokens": 2048},
        }
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as http:
                respuesta = http.post(
                    URL_INTERACTIONS,
                    json=pedido,
                    headers={"x-goog-api-key": self.clave},
                )
        except httpx.HTTPError as error:
            raise IANoDisponible(f"La IA no respondió: {error.__class__.__name__}.") from error

        if respuesta.status_code != 200:
            raise IANoDisponible(f"La IA respondió con error {respuesta.status_code}.")

        try:
            cuerpo = respuesta.json()
        except ValueError as error:
            raise IANoDisponible("La IA devolvió algo que no es JSON.") from error

        texto = extraer_texto(cuerpo)
        if not texto:
            raise IANoDisponible("La IA no devolvió texto.")
        return RespuestaIA(texto=texto, tokens=extraer_tokens(cuerpo))


def get_cliente_ia() -> ClienteIA:
    """Dependencia de FastAPI. Los tests la reemplazan por un cliente falso
    con `app.dependency_overrides`."""
    return ClienteGemini()
