from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ia.asistente import MAX_HISTORIAL
from app.schemas.part import PartOut, build_part_out


class MensajeHistorial(BaseModel):
    """Un mensaje de la conversación. No se le sacan los espacios: tiene que
    llegar idéntico a como se firmó."""

    model_config = ConfigDict(extra="forbid")

    rol: Literal["cliente", "asistente"]
    texto: str = Field(min_length=1, max_length=2000)


class AsistenteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=3, max_length=500)
    marca: str = Field(min_length=1, max_length=60)
    modelo: str = Field(min_length=1, max_length=60)
    anio: int = Field(ge=1950, le=2100)
    # La conversación hasta ahora, tal como la devolvió el backend, con su
    # firma. Vacío en el primer mensaje.
    historial: list[MensajeHistorial] = Field(default_factory=list, max_length=MAX_HISTORIAL)
    firma: str | None = Field(default=None, max_length=128)

    @field_validator("texto", "marca", "modelo")
    @classmethod
    def sin_espacios_de_mas(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("No puede estar vacío.")
        return valor


class RecomendacionOut(BaseModel):
    tipo: str
    motivo: str
    repuestos: list[PartOut]


class AsistenteOut(BaseModel):
    diagnostico: str
    urgencia: Literal["alta", "media", "baja"]
    aviso: str | None
    pregunta: str | None
    opciones: list[str]
    fuera_de_tema: bool
    recomendaciones: list[RecomendacionOut]
    # Lo que el frontend tiene que mandar en el próximo mensaje.
    historial: list[MensajeHistorial]
    firma: str


def build_asistente_out(resultado, historial: list[dict], firma: str) -> AsistenteOut:
    return AsistenteOut(
        historial=historial,
        firma=firma,
        diagnostico=resultado.diagnostico,
        urgencia=resultado.urgencia,
        aviso=resultado.aviso,
        pregunta=resultado.pregunta,
        opciones=resultado.opciones,
        fuera_de_tema=resultado.fuera_de_tema,
        recomendaciones=[
            RecomendacionOut(
                tipo=recomendacion.tipo,
                motivo=recomendacion.motivo,
                repuestos=[build_part_out(part) for part in recomendacion.repuestos],
            )
            for recomendacion in resultado.recomendaciones
        ],
    )
