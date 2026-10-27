"""Cliente de IA falso para los tests: el CI nunca llama a la IA real."""

from app.ia.cliente import IANoDisponible, RespuestaIA


class ClienteIAFalso:
    def __init__(self, texto: str = "{}", tokens: int = 100, error: Exception | None = None):
        self.texto = texto
        self.tokens = tokens
        self.error = error
        self.pedidos: list[tuple[str, str]] = []

    def generar(self, instrucciones: str, entrada: str) -> RespuestaIA:
        self.pedidos.append((instrucciones, entrada))
        if self.error:
            raise self.error
        return RespuestaIA(texto=self.texto, tokens=self.tokens)


def ia_caida() -> ClienteIAFalso:
    return ClienteIAFalso(error=IANoDisponible("La IA no respondió."))
