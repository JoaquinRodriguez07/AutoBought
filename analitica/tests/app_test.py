from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

import api

APP = str(Path(__file__).resolve().parents[1] / "app.py")

STOCK = {
    "low_stock_threshold": 5,
    "parts": [
        {"id": 1, "part_code": "FRE-001", "name": "Pastillas de freno Bosch", "manufacturer": "Bosch", "category": "Frenos", "stock": 0, "low_stock": True},
        {"id": 2, "part_code": "MOT-001", "name": "Filtro de aceite Mann-Filter", "manufacturer": "Mann-Filter", "category": "Motor", "stock": 40, "low_stock": False},
    ],
}
MAS_VENDIDOS = {
    "days": 365,
    "parts": [
        {"id": 2, "part_code": "MOT-001", "name": "Filtro de aceite Mann-Filter", "manufacturer": "Mann-Filter", "category": "Motor", "stock": 40, "units_sold": 120},
    ],
}


@pytest.fixture
def backend(monkeypatch):
    """Reemplaza la API: un vendedor y un cliente, con datos fijos."""
    tokens = {"vendedor@autobought.com": "token-vendedor", "ana@autobought.com": "token-cliente"}

    def login(email, password):
        if email not in tokens or password != "secreto":
            raise api.CredencialesInvalidas("Correo electrónico o contraseña incorrectos.")
        return tokens[email]

    def verificar_vendedor(token):
        if token != "token-vendedor":
            raise api.SinPermiso("Esta acción requiere una cuenta de vendedor.")

    monkeypatch.setattr(api, "login", login)
    monkeypatch.setattr(api, "verificar_vendedor", verificar_vendedor)
    monkeypatch.setattr(api, "stock", lambda token, umbral: STOCK)
    monkeypatch.setattr(api, "mas_vendidos", lambda token, limite, dias: MAS_VENDIDOS)


def _ingresar(email, password="secreto"):
    app = AppTest.from_file(APP).run()
    app.text_input[0].input(email)
    app.text_input[1].input(password)
    app.button[0].click().run()
    return app


def _textos(elementos):
    return [elemento.value for elemento in elementos]


def test_sin_sesion_pide_iniciar_sesion(backend):
    app = AppTest.from_file(APP).run()

    assert app.title[0].value == "Dashboard del vendedor"
    assert not app.metric


def test_un_vendedor_entra_al_dashboard(backend):
    app = _ingresar("vendedor@autobought.com")

    assert not app.exception
    assert app.title[0].value == "Dashboard"
    assert [m.label for m in app.metric] == ["Repuestos en el catálogo", "Unidades en stock", "Con stock bajo", "Sin stock"]
    assert [m.value for m in app.metric] == ["2", "40", "0", "1"]
    assert [t.label for t in app.tabs] == ["Stock actual", "Más vendidos"]


def test_un_cliente_no_entra_al_dashboard(backend):
    app = _ingresar("ana@autobought.com")

    assert "Esta cuenta no tiene acceso al dashboard: es solo para vendedores." in _textos(app.error)
    assert "token" not in app.session_state
    assert not app.metric


def test_credenciales_incorrectas(backend):
    app = _ingresar("vendedor@autobought.com", password="otra")

    assert "Correo electrónico o contraseña incorrectos." in _textos(app.error)
    assert "token" not in app.session_state


def test_sesion_vencida_vuelve_al_login(backend, monkeypatch):
    app = _ingresar("vendedor@autobought.com")

    def vencida(token, umbral):
        raise api.SesionVencida("Token inválido o expirado.")

    monkeypatch.setattr(api, "stock", vencida)
    app.run()

    assert "token" not in app.session_state
    assert app.title[0].value == "Dashboard del vendedor"
    assert "Tu sesión venció. Volvé a ingresar." in _textos(app.warning)


def test_cerrar_sesion(backend):
    app = _ingresar("vendedor@autobought.com")

    app.sidebar.button[0].click().run()

    assert "token" not in app.session_state
    assert app.title[0].value == "Dashboard del vendedor"
