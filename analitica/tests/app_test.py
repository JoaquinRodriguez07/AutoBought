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

EVOLUCION = {
    "months": 12,
    "category": None,
    "points": [
        {"month": "2026-08", "units_sold": 10, "revenue": 10000, "partial": False},
        {"month": "2026-09", "units_sold": 15, "revenue": 15000, "partial": False},
        {"month": "2026-10", "units_sold": 4, "revenue": 4000, "partial": True},
    ],
}
SIN_VENTAS = {
    "months": 12,
    "category": None,
    "points": [{"month": "2026-10", "units_sold": 0, "revenue": 0, "partial": True}],
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
    # Anota con qué filtros se pidió la evolución: (meses, categoría).
    pedidos = []

    def evolucion_ventas(token, meses, categoria):
        pedidos.append((meses, categoria))
        return EVOLUCION

    monkeypatch.setattr(api, "evolucion_ventas", evolucion_ventas)
    return pedidos


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
    assert [t.label for t in app.tabs] == ["Stock actual", "Más vendidos", "Evolución de ventas"]


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


# --- Evolución de ventas ---


def _grafico_de_evolucion(app):
    # El gráfico de líneas es el único con una capa de puntos con forma.
    return [g for g in app.get("vega_lite_chart") if "triangle-up" in g.proto.spec]


def test_la_evolucion_muestra_el_grafico_de_los_ultimos_12_meses_de_toda_la_tienda(backend):
    app = _ingresar("vendedor@autobought.com")

    assert not app.exception
    assert app.selectbox(key="evolucion_periodo").value == "Últimos 12 meses"
    assert app.selectbox(key="evolucion_categoria").value == "Todas las categorías"
    assert backend[-1] == (12, None)
    assert len(_grafico_de_evolucion(app)) == 1
    assert "Unidades vendidas por mes · toda la tienda" in _textos(app.subheader)


def test_el_selector_de_categoria_ofrece_las_categorias_del_catalogo(backend):
    app = _ingresar("vendedor@autobought.com")

    assert app.selectbox(key="evolucion_categoria").options == ["Todas las categorías", "Frenos", "Motor"]


def test_filtrar_la_evolucion_por_categoria_pide_solo_esa_categoria(backend):
    app = _ingresar("vendedor@autobought.com")

    app.selectbox(key="evolucion_categoria").select("Frenos").run()

    assert backend[-1] == (12, "Frenos")
    assert "Unidades vendidas por mes · categoría Frenos" in _textos(app.subheader)


def test_cambiar_el_periodo_pide_esa_cantidad_de_meses(backend):
    app = _ingresar("vendedor@autobought.com")

    app.selectbox(key="evolucion_periodo").select("Últimos 6 meses").run()

    assert backend[-1] == (6, None)


def test_la_evolucion_se_puede_ver_en_facturacion(backend):
    app = _ingresar("vendedor@autobought.com")

    app.radio(key="evolucion_metrica").set_value("Facturación").run()

    assert not app.exception
    assert "Facturación por mes · toda la tienda" in _textos(app.subheader)


def test_sin_ventas_en_el_periodo_avisa_en_vez_de_graficar(backend, monkeypatch):
    monkeypatch.setattr(api, "evolucion_ventas", lambda token, meses, categoria: SIN_VENTAS)

    app = _ingresar("vendedor@autobought.com")

    assert "No hay ventas registradas en este período (toda la tienda)." in _textos(app.info)
    assert not _grafico_de_evolucion(app)
