"""Tests del servicio de IA: el cliente de Gemini, el límite diario y el registro de uso."""

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.ia.client import GeminiClient, AIUnavailable, extract_text, extract_tokens
from app.ia.service import recent_queries, check_limit, extract_json, ask_structured, record_usage
from app.models.client import Client
from app.models.ai_usage import AIUsage
from ia_fake import FakeAIClient

RESPUESTA_INTERACTIONS = {
    "id": "v1_abc",
    "status": "completed",
    "steps": [
        {"type": "thought", "content": [{"type": "text", "text": "pensando..."}]},
        {"type": "model_output", "content": [{"type": "text", "text": '{"ok": true}'}]},
    ],
    "usage": {"total_tokens": 321},
}


class Output(BaseModel):
    diagnostico: str
    urgencia: str


def customer_with(handler) -> GeminiClient:
    return GeminiClient(key="clave-de-prueba", modelo="modelo-x", timeout=1, transport=httpx.MockTransport(handler))


# =====================================================
# Lectura de la respuesta
# =====================================================


def test_extrae_el_texto_final_sin_el_pensamiento():
    assert extract_text(RESPUESTA_INTERACTIONS) == '{"ok": true}'
    assert extract_tokens(RESPUESTA_INTERACTIONS) == 321


def test_tambien_entiende_generate_content():
    reply = {
        "candidates": [{"content": {"parts": [{"text": "borrador", "thought": True}, {"text": "hola"}]}}],
        "usageMetadata": {"totalTokenCount": 12},
    }

    assert extract_text(reply) == "hola"
    assert extract_tokens(reply) == 12


# =====================================================
# Cliente de Gemini (con transporte falso)
# =====================================================


def test_manda_el_pedido_con_la_clave_y_devuelve_el_texto():
    orders_list = []

    def handler(request: httpx.Request):
        orders_list.append(request)
        return httpx.Response(200, json=RESPUESTA_INTERACTIONS)

    reply = customer_with(handler).generar("Sos un mecánico.", "chilla al frenar")

    assert reply.texto == '{"ok": true}'
    assert reply.tokens == 321
    assert orders_list[0].headers["x-goog-api-key"] == "clave-de-prueba"
    body_data = orders_list[0].read().decode()
    assert '"model":"modelo-x"' in body_data.replace(" ", "")
    assert "chilla al frenar" in body_data
    assert "Sos un mecánico." in body_data or "Sos un mec\\u00e1nico." in body_data


def test_sin_clave_no_esta_disponible():
    with pytest.raises(AIUnavailable, match="clave"):
        GeminiClient(key="").generar("x", "y")


def test_error_del_proveedor_no_esta_disponible_y_dice_el_motivo():
    with pytest.raises(AIUnavailable, match="500"):
        customer_with(lambda request: httpx.Response(500, json={"error": {"message": "boom"}})).generar("x", "y")
    with pytest.raises(AIUnavailable, match="API key not valid"):
        customer_with(lambda request: httpx.Response(400, json={"error": {"message": "API key not valid."}})).generar("x", "y")


def test_tiempo_agotado_no_esta_disponible():
    def handler(request):
        raise httpx.ReadTimeout("lento", request=request)

    with pytest.raises(AIUnavailable, match="no respondió"):
        customer_with(handler).generar("x", "y")


def test_respuesta_sin_texto_no_esta_disponible():
    vacia = {"steps": [{"type": "thought", "content": [{"type": "text", "text": "..."}]}]}

    with pytest.raises(AIUnavailable, match="no devolvió texto"):
        customer_with(lambda request: httpx.Response(200, json=vacia)).generar("x", "y")


# =====================================================
# Respuestas estructuradas
# =====================================================


def test_acepta_json_dentro_de_un_bloque_de_codigo():
    texto = 'Acá va:\n```json\n{"diagnostico": "pastillas gastadas", "urgencia": "alta"}\n```'

    assert extract_json(texto) == {"diagnostico": "pastillas gastadas", "urgencia": "alta"}


def test_valida_la_respuesta_contra_el_modelo():
    customer = FakeAIClient('{"diagnostico": "batería descargada", "urgencia": "media"}', tokens=50)

    output, tokens = ask_structured(customer, "instrucciones", "no arranca", Output)

    assert output == Output(diagnostico="batería descargada", urgencia="media")
    assert tokens == 50
    assert customer.orders_list == [("instrucciones", "no arranca")]


@pytest.mark.parametrize("texto", ["no sé", '{"diagnostico": "x"}', '{"diagnostico": 1, "urgencia": ', "[1, 2]"])
def test_rechaza_lo_que_no_respeta_el_formato(texto):
    with pytest.raises(AIUnavailable):
        ask_structured(FakeAIClient(texto), "i", "e", Output)


# =====================================================
# Límite de consultas y registro de uso
# =====================================================


def make_client(db):
    customer = Client(username="ana", password="x", name="Ana", email="ana@example.com")
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def test_registra_cada_consulta_con_sus_tokens(db_session):
    customer = make_client(db_session)

    record_usage(db_session, customer.user_id, "asistente", tokens=120, ok=True)
    record_usage(db_session, customer.user_id, "asistente", tokens=0, ok=False)

    usages = db_session.query(AIUsage).order_by(AIUsage.uso_ia_id).all()
    assert [(u.funcionalidad, u.tokens, u.ok) for u in usages] == [("asistente", 120, True), ("asistente", 0, False)]
    # Las consultas que fallaron (la IA no respondió) no cuentan para el límite.
    assert recent_queries(db_session, customer.user_id) == 1


def test_supera_el_limite_responde_429(db_session):
    customer = make_client(db_session)
    for _ in range(3):
        record_usage(db_session, customer.user_id, "asistente", tokens=10, ok=True)

    check_limit(db_session, customer.user_id, limit_value=4)
    record_usage(db_session, customer.user_id, "asistente", tokens=10, ok=True)

    with pytest.raises(HTTPException) as error:
        check_limit(db_session, customer.user_id, limit_value=4)
    assert error.value.status_code == 429


def test_solo_cuentan_las_ultimas_24_horas(db_session):
    customer = make_client(db_session)
    old = AIUsage(user_id=customer.user_id, funcionalidad="asistente", tokens=1, ok=True,
                  created_at=datetime.now(timezone.utc) - timedelta(hours=25))
    db_session.add(old)
    db_session.commit()

    assert recent_queries(db_session, customer.user_id) == 0
