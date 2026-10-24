import json
from pathlib import Path

import pytest

from app.core.security import create_access_token
from app.ia.asistente import INSTRUCCIONES, TIPOS_REPUESTO
from app.ia.cliente import get_cliente_ia
from app.models.car_model import CarModel
from app.models.client import Client
from app.models.compatibility import Compatibility
from app.models.employee import Employee
from app.models.part import Part
from app.models.uso_ia import UsoIA
from backend.main import app
from ia_fake import ClienteIAFalso, ia_caida

ASISTENTE = "/api/v1/asistente"
CATALOGO = Path(__file__).resolve().parents[1] / "backend" / "data" / "parts.json"


def respuesta_ia(**cambios) -> str:
    datos = {
        "diagnostico": "Parece que las pastillas de freno están gastadas.",
        "urgencia": "alta",
        "aviso": "Si los frenos fallan, no manejes.",
        "tipos": [
            {"tipo": "Pastillas de freno", "motivo": "El chillido suele ser el indicador de desgaste."},
            {"tipo": "Discos de freno", "motivo": "Con pastillas muy gastadas, el disco se raya."},
        ],
        "pregunta": None,
        "fuera_de_tema": False,
    }
    datos.update(cambios)
    return json.dumps(datos)


@pytest.fixture
def ia(client):
    """Reemplaza la IA real por una falsa; cada test le pone su respuesta."""
    falsa = ClienteIAFalso(respuesta_ia(), tokens=250)
    app.dependency_overrides[get_cliente_ia] = lambda: falsa
    yield falsa
    app.dependency_overrides.pop(get_cliente_ia, None)


def make_client(db):
    cliente = Client(username="ana", password="x", name="Ana", email="ana@example.com")
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


def headers_de(user, user_type="client"):
    token = create_access_token(subject=str(user.user_id), extra_claims={"user_type": user_type})
    return {"Authorization": f"Bearer {token}"}


def make_part(db, code, name, manufacturer, price, stock, car, year_from=2013, year_to=2019, category="Frenos"):
    part = Part(part_code=code, name=name, manufacturer=manufacturer, category=category, price=price, stock=stock)
    part.compatibilities.append(Compatibility(car_model=car, year_from=year_from, year_to=year_to))
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@pytest.fixture
def catalogo(db_session):
    onix = CarModel(brand="Chevrolet", model="Onix", engine_code="1.4 8V")
    gol = CarModel(brand="Volkswagen", model="Gol", engine_code="1.6 MSI")
    return {
        "bosch": make_part(db_session, "BRK-1", "Pastillas de freno delanteras Bosch", "Bosch", 2800, 5, onix),
        "brembo": make_part(db_session, "BRK-2", "Pastillas de freno delanteras Brembo", "Brembo", 3600, 4, onix),
        "trw": make_part(db_session, "BRK-3", "Pastillas de freno delanteras TRW", "TRW", 2500, 0, onix),
        "gol": make_part(db_session, "BRK-4", "Pastillas de freno delanteras Bosch", "Bosch", 2700, 9, gol),
        "vieja": make_part(db_session, "BRK-5", "Pastillas de freno delanteras Ferodo", "Ferodo", 1900, 9, onix, 2005, 2010),
        "disco": make_part(db_session, "BRK-6", "Discos de freno delanteros Brembo", "Brembo", 3600, 2, onix),
    }


def consultar(client, headers, texto="chilla al frenar", marca="Chevrolet", modelo="Onix", anio=2016):
    return client.post(ASISTENTE, headers=headers, json={"texto": texto, "marca": marca, "modelo": modelo, "anio": anio})


# =====================================================
# Recomendación por síntoma
# =====================================================


def test_recomienda_repuestos_compatibles_con_su_motivo(client, db_session, ia, catalogo):
    respuesta = consultar(client, headers_de(make_client(db_session)))

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["diagnostico"].startswith("Parece que las pastillas")
    assert datos["urgencia"] == "alta"
    assert datos["aviso"] == "Si los frenos fallan, no manejes."
    assert [r["tipo"] for r in datos["recomendaciones"]] == ["Pastillas de freno", "Discos de freno"]
    assert datos["recomendaciones"][0]["motivo"].startswith("El chillido")

    # Con stock primero y más baratos; uno por fabricante; nada de otros autos o años.
    pastillas = [p["id"] for p in datos["recomendaciones"][0]["repuestos"]]
    assert pastillas == [catalogo["bosch"].id, catalogo["brembo"].id]
    assert datos["recomendaciones"][0]["repuestos"][0]["manufacturer"] == "Bosch"


def test_le_pasa_a_la_ia_el_vehiculo_y_el_texto(client, db_session, ia, catalogo):
    consultar(client, headers_de(make_client(db_session)), texto="hace ruido atrás")

    instrucciones, entrada = ia.pedidos[0]
    assert instrucciones == INSTRUCCIONES
    assert "Chevrolet Onix 2016" in entrada
    assert "hace ruido atrás" in entrada


def test_descarta_tipos_inventados_repetidos_o_sin_repuestos_para_el_auto(client, db_session, ia, catalogo):
    ia.texto = respuesta_ia(tipos=[
        {"tipo": "Turbo compresor", "motivo": "inventado"},
        {"tipo": "pastillas de freno", "motivo": "en minúsculas igual vale"},
        {"tipo": "Pastillas de freno", "motivo": "repetido"},
        {"tipo": "Radiador", "motivo": "no hay radiadores para el Onix"},
    ])

    datos = consultar(client, headers_de(make_client(db_session))).json()

    assert [(r["tipo"], r["motivo"]) for r in datos["recomendaciones"]] == [("Pastillas de freno", "en minúsculas igual vale")]


def test_si_no_hay_repuestos_para_ese_auto_igual_da_el_diagnostico(client, db_session, ia, catalogo):
    datos = consultar(client, headers_de(make_client(db_session)), marca="Fiat", modelo="Uno", anio=2015).json()

    assert datos["diagnostico"]
    assert datos["recomendaciones"] == []


def test_fuera_de_tema_no_recomienda_repuestos(client, db_session, ia, catalogo):
    ia.texto = respuesta_ia(
        diagnostico="Solo puedo ayudarte con problemas del auto.", urgencia="baja", aviso=None,
        tipos=[{"tipo": "Batería", "motivo": "x"}], fuera_de_tema=True,
    )

    datos = consultar(client, headers_de(make_client(db_session)), texto="¿quién ganó el partido?").json()

    assert datos["fuera_de_tema"] is True
    assert datos["recomendaciones"] == []


def test_el_aviso_es_solo_para_urgencia_alta(client, db_session, ia, catalogo):
    ia.texto = respuesta_ia(urgencia="baja", aviso="no debería aparecer")

    assert consultar(client, headers_de(make_client(db_session))).json()["aviso"] is None


# =====================================================
# Plan B, límites y permisos
# =====================================================


def test_si_la_ia_no_responde_devuelve_503_y_lo_registra(client, db_session, catalogo):
    app.dependency_overrides[get_cliente_ia] = ia_caida
    cliente = make_client(db_session)
    try:
        respuesta = consultar(client, headers_de(cliente))
    finally:
        app.dependency_overrides.pop(get_cliente_ia, None)

    assert respuesta.status_code == 503
    assert "catálogo" in respuesta.json()["detail"]
    uso = db_session.query(UsoIA).one()
    assert (uso.user_id, uso.ok, uso.tokens) == (cliente.user_id, False, 0)


def test_si_la_ia_responde_cualquier_cosa_devuelve_503(client, db_session, ia, catalogo):
    ia.texto = "Perdón, no entendí."

    assert consultar(client, headers_de(make_client(db_session))).status_code == 503


def test_registra_el_uso_con_los_tokens(client, db_session, ia, catalogo):
    cliente = make_client(db_session)
    consultar(client, headers_de(cliente))

    uso = db_session.query(UsoIA).one()
    assert (uso.funcionalidad, uso.tokens, uso.ok) == ("asistente", 250, True)


def test_limite_de_consultas_responde_429_sin_llamar_a_la_ia(client, db_session, ia, catalogo, monkeypatch):
    monkeypatch.setattr("app.ia.servicio.IA_LIMITE_DIARIO", 2)
    headers = headers_de(make_client(db_session))

    assert consultar(client, headers).status_code == 200
    assert consultar(client, headers).status_code == 200
    respuesta = consultar(client, headers)

    assert respuesta.status_code == 429
    assert "límite" in respuesta.json()["detail"]
    assert len(ia.pedidos) == 2


def test_pide_sesion_de_cliente(client, db_session, ia, catalogo):
    assert consultar(client, {}).status_code == 401

    vendedor = Employee(username="vendedor", password="x", name="Vendedor", email="vendedor@example.com")
    db_session.add(vendedor)
    db_session.commit()
    assert consultar(client, headers_de(vendedor, "employee")).status_code == 403
    assert ia.pedidos == []


@pytest.mark.parametrize("cambio", [{"texto": "ab"}, {"texto": "   "}, {"anio": 1800}, {"marca": ""}, {"extra": 1}])
def test_valida_el_pedido(client, db_session, ia, cambio):
    cuerpo = {"texto": "chilla al frenar", "marca": "Chevrolet", "modelo": "Onix", "anio": 2016, **cambio}

    respuesta = client.post(ASISTENTE, headers=headers_de(make_client(db_session)), json=cuerpo)

    assert respuesta.status_code == 422
    assert ia.pedidos == []


# =====================================================
# Tipos del catálogo
# =====================================================


def test_los_tipos_cubren_todo_el_catalogo_y_estan_en_las_instrucciones():
    partes = json.loads(CATALOGO.read_text(encoding="utf-8"))["parts"]
    sin_tipo = [p["name"] for p in partes if not any(p["name"].startswith(t) for t in TIPOS_REPUESTO)]

    assert sin_tipo == []
    for tipo in TIPOS_REPUESTO:
        assert f"- {tipo}" in INSTRUCCIONES
