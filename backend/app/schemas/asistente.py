from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.part import PartOut, build_part_out


class AsistenteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=3, max_length=500)
    marca: str = Field(min_length=1, max_length=60)
    modelo: str = Field(min_length=1, max_length=60)
    anio: int = Field(ge=1950, le=2100)

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
    fuera_de_tema: bool
    recomendaciones: list[RecomendacionOut]


def build_asistente_out(resultado) -> AsistenteOut:
    return AsistenteOut(
        diagnostico=resultado.diagnostico,
        urgencia=resultado.urgencia,
        aviso=resultado.aviso,
        pregunta=resultado.pregunta,
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
