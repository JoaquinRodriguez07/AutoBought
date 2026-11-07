"""Cliente de IA falso para los tests: el CI nunca llama a la IA real."""

from app.ia.client import AIUnavailable, AIResponse


class FakeAIClient:
    def __init__(self, texto: str = "{}", tokens: int = 100, error: Exception | None = None):
        self.texto = texto
        self.tokens = tokens
        self.error = error
        self.orders_list: list[tuple[str, str]] = []

    def generate(self, instructions: str, input_text: str) -> AIResponse:
        self.orders_list.append((instructions, input_text))
        if self.error:
            raise self.error
        return AIResponse(texto=self.texto, tokens=self.tokens)


def ai_down() -> FakeAIClient:
    return FakeAIClient(error=AIUnavailable("La IA no respondió."))
