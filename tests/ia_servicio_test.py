from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.ia.cliente import ClienteGemini, IANoDisponible, extraer_texto, extraer_tokens
from app.ia.servicio import consultas_recientes, controlar_limite, extraer_json, pedir_estructurado, registrar_uso
from app.models.client import Client
from app.models.uso_ia import UsoIA
from ia_fake import ClienteIAFalso

RESPUESTA_INTERACTIONS = {
    "id": "v1_abc",
    "status": "completed",
    "steps": [
        {"type": "thought", "content": [{"type": "text", "text": "pensando..."}]},
        {"type": "model_output", "content": [{"type": "text", "text": '{"ok": true}'}]},
    ],
    "usage": {"total_tokens": 321},
}


class Salida(BaseModel):
    diagnostico: str
    urgencia: str


def cliente_con(handler) -> ClienteGemini:
    return ClienteGemini(clave="clave-de-prueba", modelo="modelo-x", timeout=1, transport=httpx.MockTransport(handler))


# =====================================================
# Lectura de la respuesta
# =====================================================


def test_extrae_el_texto_final_sin_el_pensamiento():
    assert extraer_texto(RESPUESTA_INTERACTIONS) == '{"ok": true}'
    assert extraer_tokens(RESPUESTA_INTERACTIONS) == 321


def test_tambien_entiende_generate_content():
    respuesta = {
        "candidates": [{"content": {"parts": [{"text": "borrador", "thought": True}, {"text": "hola"}]}}],
        "usageMetadata": {"totalTokenCount": 12},
    }

    assert extraer_texto(respuesta) == "hola"
    assert extraer_tokens(respuesta) == 12


# =====================================================
# Cliente de Gemini (con transporte falso)
# =====================================================


def test_manda_el_pedido_con_la_clave_y_devuelve_el_texto():
    pedidos = []

    def handler(request: httpx.Request):
        pedidos.append(request)
        return httpx.Response(200, json=RESPUESTA_INTERACTIONS)

    respuesta = cliente_con(handler).generar("Sos un mecánico.", "chilla al frenar")

    assert respuesta.texto == '{"ok": true}'
    assert respuesta.tokens == 321
    assert pedidos[0].headers["x-goog-api-key"] == "clave-de-prueba"
    cuerpo = pedidos[0].read().decode()
    assert '"model":"modelo-x"' in cuerpo.replace(" ", "")
    assert "chilla al frenar" in cuerpo
    assert "Sos un mecánico." in cuerpo or "Sos un mec\\u00e1nico." in cuerpo


def test_sin_clave_no_esta_disponible():
    with pytest.raises(IANoDisponible, match="clave"):
        ClienteGemini(clave="").generar("x", "y")


def test_error_del_proveedor_no_esta_disponible_y_dice_el_motivo():
    with pytest.raises(IANoDisponible, match="500"):
        cliente_con(lambda request: httpx.Response(500, json={"error": {"message": "boom"}})).generar("x", "y")
    with pytest.raises(IANoDisponible, match="API key not valid"):
        cliente_con(lambda request: httpx.Response(400, json={"error": {"message": "API key not valid."}})).generar("x", "y")


def test_tiempo_agotado_no_esta_disponible():
    def handler(request):
        raise httpx.ReadTimeout("lento", request=request)

    with pytest.raises(IANoDisponible, match="no respondió"):
        cliente_con(handler).generar("x", "y")


def test_respuesta_sin_texto_no_esta_disponible():
    vacia = {"steps": [{"type": "thought", "content": [{"type": "text", "text": "..."}]}]}

    with pytest.raises(IANoDisponible, match="no devolvió texto"):
        cliente_con(lambda request: httpx.Response(200, json=vacia)).generar("x", "y")


# =====================================================
# Respuestas estructuradas
# =====================================================


def test_acepta_json_dentro_de_un_bloque_de_codigo():
    texto = 'Acá va:\n```json\n{"diagnostico": "pastillas gastadas", "urgencia": "alta"}\n```'

    assert extraer_json(texto) == {"diagnostico": "pastillas gastadas", "urgencia": "alta"}


def test_valida_la_respuesta_contra_el_modelo():
    cliente = ClienteIAFalso('{"diagnostico": "batería descargada", "urgencia": "media"}', tokens=50)

    salida, tokens = pedir_estructurado(cliente, "instrucciones", "no arranca", Salida)

    assert salida == Salida(diagnostico="batería descargada", urgencia="media")
    assert tokens == 50
    assert cliente.pedidos == [("instrucciones", "no arranca")]


@pytest.mark.parametrize("texto", ["no sé", '{"diagnostico": "x"}', '{"diagnostico": 1, "urgencia": ', "[1, 2]"])
def test_rechaza_lo_que_no_respeta_el_formato(texto):
    with pytest.raises(IANoDisponible):
        pedir_estructurado(ClienteIAFalso(texto), "i", "e", Salida)


# =====================================================
# Límite de consultas y registro de uso
# =====================================================


def make_client(db):
    cliente = Client(username="ana", password="x", name="Ana", email="ana@example.com")
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


def test_registra_cada_consulta_con_sus_tokens(db_session):
    cliente = make_client(db_session)

    registrar_uso(db_session, cliente.user_id, "asistente", tokens=120, ok=True)
    registrar_uso(db_session, cliente.user_id, "asistente", tokens=0, ok=False)

    usos = db_session.query(UsoIA).order_by(UsoIA.uso_ia_id).all()
    assert [(u.funcionalidad, u.tokens, u.ok) for u in usos] == [("asistente", 120, True), ("asistente", 0, False)]
    assert consultas_recientes(db_session, cliente.user_id) == 2


def test_supera_el_limite_responde_429(db_session):
    cliente = make_client(db_session)
    for _ in range(3):
        registrar_uso(db_session, cliente.user_id, "asistente", tokens=10, ok=True)

    controlar_limite(db_session, cliente.user_id, limite=4)
    registrar_uso(db_session, cliente.user_id, "asistente", tokens=10, ok=True)

    with pytest.raises(HTTPException) as error:
        controlar_limite(db_session, cliente.user_id, limite=4)
    assert error.value.status_code == 429


def test_solo_cuentan_las_ultimas_24_horas(db_session):
    cliente = make_client(db_session)
    viejo = UsoIA(user_id=cliente.user_id, funcionalidad="asistente", tokens=1, ok=True,
                  created_at=datetime.now(timezone.utc) - timedelta(hours=25))
    db_session.add(viejo)
    db_session.commit()

    assert consultas_recientes(db_session, cliente.user_id) == 0
