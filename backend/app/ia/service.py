"""Servicio de IA: respuestas estructuradas, límite de consultas y registro
de uso. Lo usan todas las funcionalidades con IA."""

import json
from datetime import datetime, timedelta, timezone
from typing import TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import AI_DAILY_LIMIT
from app.ia.client import AIClient, AIUnavailable
from app.models.ai_usage import AIUsage

ModelT = TypeVar("Modelo", bound=BaseModel)

def extract_json(texto: str) -> dict:
    """El objeto JSON de la respuesta, aunque venga dentro de un bloque de
    código o con texto alrededor."""
    # Si viene en un bloque ```json ... ```, se queda con lo de adentro.
    partes = texto.split("```")
    if len(partes) >= 3:
        texto = partes[1].removeprefix("json")
    start_at, end = texto.find("{"), texto.rfind("}")
    if start_at == -1 or end <= start_at:
        raise AIUnavailable("La respuesta de la IA no trae un objeto JSON.")
    try:
        data = json.loads(texto[start_at : end + 1])
    except json.JSONDecodeError as error:
        raise AIUnavailable("La respuesta de la IA no es un JSON válido.") from error
    if not isinstance(data, dict):
        raise AIUnavailable("La respuesta de la IA no es un objeto JSON.")
    return data


def ask_structured(
    ai_client: AIClient, instructions: str, input_text: str, modelo: type[ModelT]
) -> tuple[ModelT, int]:
    """Pide una respuesta y la valida contra `modelo`. Si no respeta el
    formato, se rechaza: nunca llega a la funcionalidad algo a medias.
    Devuelve el objeto validado y los tokens que se usaron."""
    reply = ai_client.generate(instructions, input_text)
    try:
        return modelo.model_validate(extract_json(reply.texto)), reply.tokens
    except ValidationError as error:
        raise AIUnavailable("La respuesta de la IA no respeta el formato pedido.") from error


def recent_queries(db: Session, user_id: int, current_time: datetime | None = None) -> int:
    current_time = current_time or datetime.now(timezone.utc)
    since = current_time - timedelta(hours=24)
    return db.scalar(
        select(func.count()).select_from(AIUsage).where(AIUsage.user_id == user_id, AIUsage.ok.is_(True), AIUsage.created_at >= since)
    ) or 0


def check_limit(db: Session, user_id: int, limit_value: int | None = None) -> None:
    """429 si el usuario ya hizo el máximo de consultas de las últimas 24 h."""
    limit_value = AI_DAILY_LIMIT if limit_value is None else limit_value
    if recent_queries(db, user_id) >= limit_value:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Llegaste al límite de consultas al asistente por hoy. Probá de nuevo mañana.",
        )


def record_usage(db: Session, user_id: int, funcionalidad: str, tokens: int, ok: bool) -> None:
    db.add(AIUsage(user_id=user_id, funcionalidad=funcionalidad, tokens=tokens, ok=ok))
    db.commit()
