"""Servicio de IA: respuestas estructuradas, límite de consultas y registro
de uso. Lo usan todas las funcionalidades con IA."""

import json
import re
from datetime import datetime, timedelta, timezone
from typing import TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import IA_LIMITE_DIARIO
from app.ia.cliente import ClienteIA, IANoDisponible
from app.models.uso_ia import UsoIA

Modelo = TypeVar("Modelo", bound=BaseModel)

_BLOQUE_CODIGO = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extraer_json(texto: str) -> dict:
    """El objeto JSON de la respuesta, aunque venga dentro de un bloque de
    código o con texto alrededor."""
    bloque = _BLOQUE_CODIGO.search(texto)
    if bloque:
        texto = bloque.group(1)
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fin <= inicio:
        raise IANoDisponible("La respuesta de la IA no trae un objeto JSON.")
    try:
        datos = json.loads(texto[inicio : fin + 1])
    except json.JSONDecodeError as error:
        raise IANoDisponible("La respuesta de la IA no es un JSON válido.") from error
    if not isinstance(datos, dict):
        raise IANoDisponible("La respuesta de la IA no es un objeto JSON.")
    return datos


def pedir_estructurado(
    cliente: ClienteIA, instrucciones: str, entrada: str, modelo: type[Modelo]
) -> tuple[Modelo, int]:
    """Pide una respuesta y la valida contra `modelo`. Si no respeta el
    formato, se rechaza: nunca llega a la funcionalidad algo a medias.
    Devuelve el objeto validado y los tokens que se usaron."""
    respuesta = cliente.generar(instrucciones, entrada)
    try:
        return modelo.model_validate(extraer_json(respuesta.texto)), respuesta.tokens
    except ValidationError as error:
        raise IANoDisponible("La respuesta de la IA no respeta el formato pedido.") from error


def consultas_recientes(db: Session, user_id: int, ahora: datetime | None = None) -> int:
    ahora = ahora or datetime.now(timezone.utc)
    desde = ahora - timedelta(hours=24)
    return db.scalar(
        select(func.count()).select_from(UsoIA).where(UsoIA.user_id == user_id, UsoIA.created_at >= desde)
    ) or 0


def controlar_limite(db: Session, user_id: int, limite: int | None = None) -> None:
    """429 si el usuario ya hizo el máximo de consultas de las últimas 24 h."""
    limite = IA_LIMITE_DIARIO if limite is None else limite
    if consultas_recientes(db, user_id) >= limite:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Llegaste al límite de consultas al asistente por hoy. Probá de nuevo mañana.",
        )


def registrar_uso(db: Session, user_id: int, funcionalidad: str, tokens: int, ok: bool) -> None:
    db.add(UsoIA(user_id=user_id, funcionalidad=funcionalidad, tokens=tokens, ok=ok))
    db.commit()
