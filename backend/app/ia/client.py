"""Cliente del modelo de IA (Gemini, Interactions API).

Es el único lugar del backend que habla con el proveedor: las
funcionalidades (el asistente de compra, el dashboard) piden texto con
`AIClient.generate` y no saben qué API hay detrás. En los tests se
reemplaza por un cliente falso (ver `get_ai_client`): el CI nunca llama a
la IA real.
"""

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import GEMINI_API_KEY, GEMINI_API_URL, GEMINI_MODEL, AI_TIMEOUT_SECONDS


class AIUnavailable(Exception):
    """La IA no se puede usar ahora: falta la clave, no respondió a tiempo,
    devolvió un error o una respuesta que no sirve. Cada funcionalidad lo
    maneja con un plan B y un mensaje claro."""


@dataclass
class AIResponse:
    texto: str
    tokens: int = 0


class AIClient(Protocol):
    def generate(self, instructions: str, input_text: str, timeout: float | None = None) -> AIResponse:
        """`timeout`: segundos para esta llamada; sin valor, el del cliente."""
        ...


def extract_text(reply: dict) -> str:
    """El texto final de la respuesta. Se ignoran los pasos de "pensamiento"
    y se aceptan las dos formas de la API: `steps[].content[]` con
    `type: "text"` (Interactions) y `candidates[].content.parts[].text`
    (generateContent)."""
    parts_list: list[str] = []

    def recorrer(nodo, en_pensamiento: bool) -> None:
        if isinstance(nodo, list):
            for hijo in nodo:
                recorrer(hijo, en_pensamiento)
            return
        if not isinstance(nodo, dict):
            return
        pensamiento = en_pensamiento or nodo.get("type") == "thought" or nodo.get("thought") is True
        texto = nodo.get("text")
        is_text = nodo.get("type") == "text" or ("text" in nodo and "type" not in nodo)
        if not pensamiento and is_text and isinstance(texto, str):
            parts_list.append(texto)
            return
        for key, hijo in nodo.items():
            if key != "text":
                recorrer(hijo, pensamiento)

    recorrer(reply.get("steps") or reply.get("candidates") or [], False)
    return "".join(parts_list).strip()


def extract_tokens(reply: dict) -> int:
    usage = reply.get("usage") or {}
    if "total_tokens" in usage:
        return int(usage["total_tokens"])
    usage = reply.get("usageMetadata") or {}
    return int(usage.get("totalTokenCount", 0))


class GeminiClient:
    def __init__(
        self,
        key: str = GEMINI_API_KEY,
        modelo: str = GEMINI_MODEL,
        timeout: float = AI_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
        url: str = GEMINI_API_URL,
    ):
        self.key = key
        self.modelo = modelo
        self.timeout = timeout
        self.url = url
        # Solo para los tests: un transporte falso en vez de la red.
        self.transport = transport

    def generate(self, instructions: str, input_text: str, timeout: float | None = None) -> AIResponse:
        if not self.key:
            raise AIUnavailable("No hay clave de IA configurada.")

        order_data = {
            "model": self.modelo,
            "system_instruction": instructions,
            "input": input_text,
            "store": False,
            "generation_config": {"thinking_level": "low", "max_output_tokens": 2048},
        }
        try:
            with httpx.Client(timeout=timeout or self.timeout, transport=self.transport) as http:
                reply = http.post(
                    self.url,
                    json=order_data,
                    headers={"x-goog-api-key": self.key},
                )
        except httpx.HTTPError as error:
            raise AIUnavailable(f"La IA no respondió: {error.__class__.__name__}.") from error

        if reply.status_code != 200:
            # El cuerpo del error de Google dice el motivo (clave inválida, sin
            # crédito, modelo inexistente...). Nunca trae la clave.
            raise AIUnavailable(f"La IA respondió con error {reply.status_code}: {reply.text[:300]}")

        try:
            body_data = reply.json()
        except ValueError as error:
            raise AIUnavailable("La IA devolvió algo que no es JSON.") from error

        texto = extract_text(body_data)
        if not texto:
            raise AIUnavailable("La IA no devolvió texto.")
        return AIResponse(texto=texto, tokens=extract_tokens(body_data))


def get_ai_client() -> AIClient:
    """Dependencia de FastAPI. Los tests la reemplazan por un cliente falso
    con `app.dependency_overrides`."""
    return GeminiClient()
