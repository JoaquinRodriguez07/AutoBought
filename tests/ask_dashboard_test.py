"""Preguntarle al dashboard (HU 6.4): las herramientas que puede pedir la IA,
la validación de sus parámetros, el 403, la IA caída y los límites.

La IA es siempre la falsa (tests/ai_fake.py): el CI nunca llama a Gemini.
Responde primero el plan (qué herramientas usar) y después la respuesta.
"""

import json
from datetime import date, datetime, timedelta, timezone

import jwt
import pytest

from backend.main import app
from ai_fake import FakeAIClient, ai_down
from app.api.v1.endpoints import analytics
from app.api.v1.endpoints import ask_dashboard as ask_endpoint
from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import user as crud_user
from app.ia import ask_dashboard as ai_ask
from app.ia.client import AIUnavailable, get_ai_client
from app.models.ai_usage import AIUsage
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part
from app.models.payment import Payment, PaymentStatus

ASK = "/api/v1/analytics/preguntar"
TODAY = date(2026, 11, 8)


def _headers(user_id, user_type):
    payload = {
        "sub": str(user_id),
        "user_type": user_type,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return {"Authorization": f"Bearer {jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)}"}


@pytest.fixture
def seller_user(db_session):
    return crud_user.create_employee(
        db_session, name="Vendedor Uno", email="vendedor@example.com", password_hash=hash_password("secreto123")
    )


@pytest.fixture
def seller(seller_user):
    return _headers(seller_user.user_id, "employee")


@pytest.fixture
def customer(db_session):
    return crud_user.create_client(
        db_session, name="Ana Pérez", email="ana@example.com", password_hash=hash_password("secreto123")
    )


@pytest.fixture(autouse=True)
def fixed_today(client):
    app.dependency_overrides[analytics.today] = lambda: TODAY


def _use_ai(fake):
    app.dependency_overrides[get_ai_client] = lambda: fake
    return fake


def _plan(*calls):
    return json.dumps({"herramientas": [{"nombre": name, "parametros": params} for name, params in calls]})


def _reply(text, data=0):
    return json.dumps({"respuesta": text, "datos": data})


def _part(db_session, code, category, stock=10):
    part = Part(part_code=code, name=f"Repuesto {code}", manufacturer="Bosch", category=category, price=1000, stock=stock)
    db_session.add(part)
    db_session.commit()
    return part


def _sale(db_session, customer, part, qty, year, month, payment=None, status=OrderStatus.DELIVERED):
    db_session.add(
        Order(
            client_id=customer.user_id,
            created_at=datetime(year, month, 15, 12, tzinfo=timezone.utc),
            status=status,
            ship_personal_name=customer.name,
            ship_street="Av. Italia",
            ship_number="1234",
            ship_city="Montevideo",
            ship_department="Montevideo",
            payment_method_label="Mercado Pago",
            items=[OrderItem(part=part, quantity=qty, frozen_price=part.price)],
            payment=Payment(status=payment) if payment else None,
        )
    )
    db_session.commit()


# --- Solo vendedores ---


def test_ask_is_only_for_sellers(client, customer):
    fake = _use_ai(FakeAIClient())

    assert client.post(ASK, json={"question": "¿Cómo vienen las ventas?"}).status_code == 401
    response = client.post(
        ASK, json={"question": "¿Cómo vienen las ventas?"}, headers=_headers(customer.user_id, "client")
    )

    assert response.status_code == 403
    assert fake.orders_list == []


@pytest.mark.parametrize("question", ["", "   ", "x" * 301])
def test_ask_rejects_an_empty_or_too_long_question(client, seller, question):
    fake = _use_ai(FakeAIClient())

    assert client.post(ASK, json={"question": question}, headers=seller).status_code == 422
    assert fake.orders_list == []


# --- Pregunta con respuesta ---


def test_question_with_answer_shows_the_category_and_the_data_used(client, db_session, seller, seller_user, customer):
    # Escenario "Pregunta con respuesta": ¿qué categoría vendió más en julio?
    brakes = _part(db_session, "FRE-001", "Frenos")
    filters = _part(db_session, "FIL-001", "Filtros")
    _part(db_session, "ACC-001", "Accesorios")
    _sale(db_session, customer, brakes, 12, 2026, 7)
    _sale(db_session, customer, filters, 5, 2026, 7)
    _sale(db_session, customer, filters, 50, 2026, 8)  # otro mes: no cuenta
    _sale(db_session, customer, brakes, 40, 2026, 7, status=OrderStatus.CANCELLED)  # no cuenta
    # Sin pagar tampoco cuenta, igual que en el resto del dashboard.
    _sale(db_session, customer, brakes, 60, 2026, 7, payment=PaymentStatus.PENDING, status=OrderStatus.CONFIRMED)
    fake = _use_ai(
        FakeAIClient(
            textos=[
                _plan(("ventas_por_categoria", {"mes": "2026-07"})),
                _reply("Frenos fue la categoría que más vendió en julio: 12 unidades ($ 12.000)."),
            ],
            tokens=300,
        )
    )

    response = client.post(ASK, json={"question": "¿Qué categoría vendió más en julio?"}, headers=seller)

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "Frenos fue la categoría que más vendió en julio: 12 unidades ($ 12.000)."
    assert body["data"] == {
        "columns": ["Categoría", "Unidades", "Facturación ($)"],
        "rows": [["Frenos", 12, 12000], ["Filtros", 5, 5000], ["Accesorios", 0, 0]],
    }

    # La IA eligió con la pregunta, la fecha y las categorías que existen...
    plan_input = json.loads(fake.orders_list[0][1])
    assert plan_input["pregunta"] == "¿Qué categoría vendió más en julio?"
    assert plan_input["fecha_de_hoy"] == "2026-11-08"
    assert plan_input["categorias"] == ["Accesorios", "Filtros", "Frenos"]
    # ...y redactó solo con los resultados de la herramienta.
    answer_input = json.loads(fake.orders_list[1][1])
    assert answer_input["resultados"][0]["herramienta"] == "ventas_por_categoria"
    assert answer_input["resultados"][0]["filas"][0] == ["Frenos", 12, 12000]

    usage = db_session.query(AIUsage).one()
    assert (usage.user_id, usage.funcionalidad, usage.tokens, usage.ok) == (
        seller_user.user_id,
        "pregunta_dashboard",
        600,
        True,
    )


def test_the_answer_shows_the_table_the_ai_says_it_used(client, db_session, seller, customer):
    _part(db_session, "FRE-001", "Frenos", stock=2)
    _use_ai(
        FakeAIClient(
            textos=[
                _plan(("ventas_por_mes", {"categoria": "Frenos", "meses": 3}), ("stock", {"categoria": "Frenos"})),
                _reply("Te quedan 2 unidades de pastillas.", data=1),
            ]
        )
    )

    body = client.post(ASK, json={"question": "¿Cuánto stock de frenos tengo?"}, headers=seller).json()

    assert body["data"]["columns"] == ["Código", "Repuesto", "Categoría", "Stock"]
    assert body["data"]["rows"] == [["FRE-001", "Repuesto FRE-001", "Frenos", 2]]


@pytest.mark.parametrize("data", [None, 5, -1])
def test_without_a_valid_table_index_it_shows_the_first_one(client, db_session, seller, data):
    _part(db_session, "FRE-001", "Frenos")
    _use_ai(FakeAIClient(textos=[_plan(("ventas_por_mes", {"meses": 2})), _reply("Vendiste 0 unidades.", data)]))

    body = client.post(ASK, json={"question": "¿Cómo vienen las ventas?"}, headers=seller).json()

    assert body["data"]["rows"] == [["2026-10", 0, 0], ["2026-11 (en curso)", 0, 0]]


# --- Pregunta que no se puede responder ---


def test_a_question_outside_the_data_says_so_and_does_not_invent(client, db_session, seller):
    # Escenario "Pregunta que no se puede responder".
    fake = _use_ai(FakeAIClient(textos=[_plan()]))

    response = client.post(ASK, json={"question": "¿Qué opinan los clientes?"}, headers=seller)

    assert response.status_code == 200
    assert response.json() == {"answer": ai_ask.NO_DATA_ANSWER, "data": None}
    # No se le pide a la IA que redacte nada: la respuesta es fija.
    assert len(fake.orders_list) == 1


# --- Las herramientas llaman a los endpoints correctos ---

# Respuestas mínimas de cada endpoint, para los espías.
ENDPOINT_BODIES = {
    "sales_by_month": {
        "months": [{"month": "2026-07", "units": 3, "revenue": 3000, "in_progress": False}],
        "projection": {"month": "2026-12", "units": 4},
    },
    "best_sellers": {"days": None, "months": 12, "parts": []},
    "stock": {"low_stock_threshold": 5, "parts": []},
    "demand_forecast": {"month": "2026-12", "parts": []},
    "stockout_risk": {"month": "2026-12", "thresholds": {"high_below": 15, "medium_up_to": 30}, "parts": []},
}


@pytest.fixture
def spies(monkeypatch):
    """Reemplaza los endpoints de análisis por espías que anotan con qué
    parámetros los llamaron."""
    calls = []
    for name, body in ENDPOINT_BODIES.items():
        def spy(_name=name, _body=body, **kwargs):
            calls.append((_name, {k: v for k, v in kwargs.items() if k != "db"}))
            return _body

        monkeypatch.setattr(analytics, name, spy)
    return calls


@pytest.mark.parametrize(
    ("tool", "params", "endpoint", "expected"),
    [
        (
            "ventas_por_mes",
            {"categoria": "Frenos", "meses": 6},
            "sales_by_month",
            {"months": 6, "category": "Frenos", "search": None, "part_id": None, "today_date": TODAY},
        ),
        (
            "ventas_por_mes",
            {},
            "sales_by_month",
            {"months": 12, "category": None, "search": None, "part_id": None, "today_date": TODAY},
        ),
        (
            "mas_vendidos",
            {"meses": 3, "busqueda": "pastilla", "limite": 5},
            "best_sellers",
            {"limit": 5, "days": None, "months": 3, "category": None, "search": "pastilla", "today_date": TODAY},
        ),
        (
            "stock",
            {"categoria": "Filtros", "solo_stock_bajo": True},
            "stock",
            {"low_stock_threshold": 5, "category": "Filtros", "search": None},
        ),
        (
            "proyeccion_demanda",
            {"categoria": "Frenos"},
            "demand_forecast",
            {"limit": 10, "category": "Frenos", "search": None, "today_date": TODAY},
        ),
        (
            "riesgo_agotamiento",
            {},
            "stockout_risk",
            {"at_risk_only": True, "category": None, "search": None, "today_date": TODAY},
        ),
        (
            "riesgo_agotamiento",
            {"solo_en_riesgo": False, "busqueda": "FRE-0"},
            "stockout_risk",
            {"at_risk_only": False, "category": None, "search": "FRE-0", "today_date": TODAY},
        ),
    ],
)
def test_each_tool_calls_its_endpoint_with_valid_params(client, seller, spies, tool, params, endpoint, expected):
    _use_ai(FakeAIClient(textos=[_plan((tool, params)), _reply("Listo.")]))

    response = client.post(ASK, json={"question": "Una pregunta"}, headers=seller)

    assert response.status_code == 200
    assert spies == [(endpoint, expected)]


def test_sales_by_category_calls_sales_by_month_for_each_category(client, db_session, seller, spies):
    _part(db_session, "FRE-001", "Frenos")
    _part(db_session, "FIL-001", "Filtros")
    _use_ai(FakeAIClient(textos=[_plan(("ventas_por_categoria", {"mes": "2026-07"})), _reply("Listo.")]))

    client.post(ASK, json={"question": "¿Qué categoría vendió más en julio?"}, headers=seller)

    # De julio a noviembre son 5 meses calendario, el actual incluido.
    assert spies == [
        ("sales_by_month", {"months": 5, "category": category, "search": None, "part_id": None, "today_date": TODAY})
        for category in ["Filtros", "Frenos"]
    ]


@pytest.mark.parametrize(
    "plan",
    [
        _plan(("borrar_pedidos", {})),
        _plan(("sql", {"consulta": "SELECT * FROM client"})),
        _plan(("ventas_por_mes", {"meses": 0})),
        _plan(("ventas_por_mes", {"meses": 25})),
        _plan(("ventas_por_mes", {"meses": "12"})),
        _plan(("ventas_por_mes", {"categoria": "x" * 61})),
        _plan(("ventas_por_mes", {"part_id": 1})),
        _plan(("mas_vendidos", {"limite": 100})),
        _plan(("stock", {"solo_stock_bajo": "sí"})),
        _plan(("ventas_por_categoria", {"mes": "julio"})),
        _plan(("ventas_por_categoria", {"mes": "2026-12"})),
        _plan(("ventas_por_categoria", {"mes": "2024-10"})),
        # Una inválida invalida todo el pedido, aunque la otra esté bien.
        _plan(("stock", {}), ("riesgo_agotamiento", {"solo_en_riesgo": "no"})),
        _plan(*[("stock", {})] * (ai_ask.MAX_TOOL_CALLS + 1)),
        "esto no es un JSON",
    ],
)
def test_invalid_tool_calls_are_rejected_without_running_anything(client, db_session, seller, spies, plan):
    _part(db_session, "FRE-001", "Frenos")
    fake = _use_ai(FakeAIClient(textos=[plan, _reply("No debería llegar.")]))

    response = client.post(ASK, json={"question": "Una pregunta"}, headers=seller)

    assert response.status_code == 503
    assert response.json()["detail"] == ask_endpoint.ASK_UNAVAILABLE
    assert spies == []
    assert len(fake.orders_list) == 1
    assert db_session.query(AIUsage).one().ok is False


def test_the_tools_use_the_real_dashboard_numbers(client, db_session, seller, customer):
    # Sin espías: la herramienta devuelve lo mismo que el endpoint del dashboard.
    brakes = _part(db_session, "FRE-001", "Frenos", stock=3)
    _sale(db_session, customer, brakes, 30, 2026, 10)
    fake = _use_ai(FakeAIClient(textos=[_plan(("riesgo_agotamiento", {})), _reply("Reponé FRE-001.")]))

    body = client.post(ASK, json={"question": "¿Qué tengo que reponer esta semana?"}, headers=seller).json()
    dashboard = client.get("/api/v1/analytics/stockout-risk", params={"at_risk_only": True}, headers=seller).json()

    row = dashboard["parts"][0]
    assert body["data"]["rows"] == [
        ["FRE-001", "Repuesto FRE-001", 3, row["projected_units"], row["coverage_days"], "Alto"]
    ]
    extra = json.loads(fake.orders_list[1][1])["resultados"][0]["extra"]
    assert extra["repuestos_riesgo_alto"] == 1


# --- IA no disponible y límites ---


def test_ai_unavailable_warns_and_the_rest_of_the_dashboard_works(client, db_session, seller, seller_user):
    # Escenario "IA no disponible".
    _part(db_session, "FRE-001", "Frenos")
    _use_ai(ai_down())

    response = client.post(ASK, json={"question": "¿Cómo vienen las ventas?"}, headers=seller)

    assert response.status_code == 503
    assert response.json()["detail"] == ask_endpoint.ASK_UNAVAILABLE
    usage = db_session.query(AIUsage).one()
    assert (usage.funcionalidad, usage.ok, usage.tokens) == ("pregunta_dashboard", False, 0)
    assert client.get("/api/v1/analytics/stock", headers=seller).status_code == 200
    assert client.get("/api/v1/analytics/sales-by-month", headers=seller).status_code == 200


def test_ai_that_fails_in_the_second_step_also_warns(client, db_session, seller):
    _part(db_session, "FRE-001", "Frenos")
    _use_ai(FakeAIClient(textos=[_plan(("stock", {})), json.dumps({"otra": "cosa"})]))

    response = client.post(ASK, json={"question": "¿Cuánto stock tengo?"}, headers=seller)

    assert response.status_code == 503


def test_hourly_limit_per_seller(client, db_session, seller, seller_user, monkeypatch):
    monkeypatch.setattr(ask_endpoint, "AI_ASK_HOURLY_LIMIT", 2)
    # Lo de otras funcionalidades (el resumen) y lo de hace más de una hora no cuenta.
    db_session.add_all(
        [
            AIUsage(user_id=seller_user.user_id, funcionalidad="resumen_dashboard", tokens=10, ok=True),
            AIUsage(
                user_id=seller_user.user_id,
                funcionalidad="pregunta_dashboard",
                tokens=10,
                ok=True,
                created_at=datetime.now(timezone.utc) - timedelta(hours=2),
            ),
        ]
    )
    db_session.commit()
    _use_ai(FakeAIClient(texto=_plan()))

    statuses = [client.post(ASK, json={"question": "¿Qué opinan?"}, headers=seller).status_code for _ in range(3)]

    assert statuses == [200, 200, 429]
    response = client.post(ASK, json={"question": "¿Qué opinan?"}, headers=seller)
    assert response.json()["detail"] == ask_endpoint.ASK_LIMIT_REACHED


def test_each_ai_call_gets_the_time_left(db_session):
    fake = FakeAIClient(textos=[_plan(("stock", {})), _reply("Listo.")])
    tools = ask_endpoint.build_tools(db_session, TODAY)

    ai_ask.answer(fake, "¿Cuánto stock tengo?", TODAY, [], tools, timeout=10)

    assert len(fake.timeouts) == 2
    assert all(0 < timeout <= 10 for timeout in fake.timeouts)


def test_past_the_maximum_time_there_is_no_answer(db_session):
    fake = FakeAIClient(textos=[_plan(("stock", {})), _reply("Listo.")])

    with pytest.raises(AIUnavailable):
        ai_ask.answer(fake, "¿Cuánto stock tengo?", TODAY, [], ask_endpoint.build_tools(db_session, TODAY), timeout=0)
    assert fake.orders_list == []
