from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ia.assistant import MAX_HISTORY
from app.schemas.part import PartOut, build_part_out


class HistoryMessage(BaseModel):
    """Un mensaje de la conversación. No se le sacan los espacios: tiene que
    llegar idéntico a como se firmó."""

    model_config = ConfigDict(extra="forbid")

    rol: Literal["cliente", "asistente"]
    texto: str = Field(min_length=1, max_length=2000)


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=3, max_length=500)
    marca: str = Field(min_length=1, max_length=60)
    modelo: str = Field(min_length=1, max_length=60)
    anio: int = Field(ge=1950, le=2100)
    # La conversación hasta ahora, tal como la devolvió el backend, con su
    # firma. Vacío en el primer mensaje.
    historial: list[HistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY)
    firma: str | None = Field(default=None, max_length=128)

    @field_validator("texto", "marca", "modelo")
    @classmethod
    def without_extra_spaces(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("No puede estar vacío.")
        return value


class RecommendationOut(BaseModel):
    tipo: str
    motivo: str
    repuestos: list[PartOut]


class AssistantOut(BaseModel):
    diagnostico: str
    urgencia: Literal["alta", "media", "baja"]
    aviso: str | None
    pregunta: str | None
    opciones: list[str]
    fuera_de_tema: bool
    recomendaciones: list[RecommendationOut]
    # Lo que el frontend tiene que mandar en el próximo mensaje.
    historial: list[HistoryMessage]
    firma: str


def build_assistant_out(result, historial: list[dict], signature: str) -> AssistantOut:
    return AssistantOut(
        historial=historial,
        firma=signature,
        diagnostico=result.diagnostico,
        urgencia=result.urgencia,
        aviso=result.aviso,
        pregunta=result.pregunta,
        opciones=result.opciones,
        fuera_de_tema=result.fuera_de_tema,
        recomendaciones=[
            RecommendationOut(
                tipo=recommendation.tipo,
                motivo=recommendation.motivo,
                repuestos=[build_part_out(part) for part in recommendation.repuestos],
            )
            for recommendation in result.recomendaciones
        ],
    )
