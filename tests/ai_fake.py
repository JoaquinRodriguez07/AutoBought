"""Cliente de IA falso para los tests: el CI nunca llama a la IA real."""

from app.ia.client import AIUnavailable, AIResponse


class FakeAIClient:
    """Responde siempre `texto`, o con `textos`, uno por llamada y en orden
    (para las funcionalidades que llaman más de una vez a la IA)."""

    def __init__(
        self,
        texto: str = "{}",
        tokens: int = 100,
        error: Exception | None = None,
        textos: list[str] | None = None,
    ):
        self.texto = texto
        self.textos = list(textos) if textos is not None else None
        self.tokens = tokens
        self.error = error
        self.orders_list: list[tuple[str, str]] = []
        self.timeouts: list[float | None] = []

    def generate(self, instructions: str, input_text: str, timeout: float | None = None) -> AIResponse:
        self.orders_list.append((instructions, input_text))
        self.timeouts.append(timeout)
        if self.error:
            raise self.error
        if self.textos is not None:
            return AIResponse(texto=self.textos.pop(0), tokens=self.tokens)
        return AIResponse(texto=self.texto, tokens=self.tokens)


def ai_down() -> FakeAIClient:
    return FakeAIClient(error=AIUnavailable("La IA no respondió."))
