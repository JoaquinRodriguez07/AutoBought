"""Resumen del dashboard con IA (HU 6.3): las métricas que se le pasan a la
IA, el resumen del día guardado, "Actualizar", el historial y la limpieza.

La IA es siempre la falsa (tests/ai_fake.py): el CI nunca llama a Gemini.
Las ventas van a mediodía UTC del día 15, como en dashboard_test.py.
"""

import json
from datetime import date, datetime, timedelta, timezone

import jwt
import pytest

from backend.main import app
from ai_fake import FakeAIClient, ai_down
from app.api.v1.endpoints.analytics import today
from app.core import analytics_math
from app.core.config import JWT_ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.crud import dashboard_summary as crud_summary
from app.crud import user as crud_user
from app.ia.client import get_ai_client
from app.ia.dashboard_summary import build_metrics
from app.models.ai_usage import AIUsage
from app.models.dashboard_summary import DashboardSummary
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.part import Part

SUMMARY = "/api/v1/analytics/summary"
HISTORY = "/api/v1/analytics/summary/history"
TASKS = "/api/v1/tareas/diarias"

# Un día fijo para las métricas: el 15 de un mes de 31 días.
DAY = date(2026, 3, 15)
POINTS = ["Las ventas vienen bien.", "Frenos cae.", "Reponé las pastillas."]


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


@pytest.fixture
def ai(client):
    fake = FakeAIClient(texto=json.dumps({"points": POINTS}), tokens=900)
    app.dependency_overrides[get_ai_client] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_ai_client, None)


def _part(db_session, code, stock, category):
    part = Part(part_code=code, name=f"Repuesto {code}", manufacturer="Bosch", category=category, price=1000, stock=stock)
    db_session.add(part)
    db_session.commit()
    return part


def _sale(db_session, customer, part, qty, year, month):
    db_session.add(
        Order(
            client_id=customer.user_id,
            created_at=datetime(year, month, 15, 12, tzinfo=timezone.utc),
            status=OrderStatus.DELIVERED,
            ship_personal_name=customer.name,
            ship_street="Av. Italia",
            ship_number="1234",
            ship_city="Montevideo",
            ship_department="Montevideo",
            payment_method_label="Visa •••• 1234",
            items=[OrderItem(part=part, quantity=qty, frozen_price=part.price)],
        )
    )
    db_session.commit()


@pytest.fixture
def sales(db_session, customer):
    # Frenos: 20 en febrero y 5 en marzo hasta el 15 (cae).
    # Filtros: nada en febrero y 3 en marzo (crece, sin base para el %).
    brakes = _part(db_session, "BRK-1", stock=4, category="Frenos")
    filters = _part(db_session, "FIL-1", stock=50, category="Filtros")
    _sale(db_session, customer, brakes, 20, 2026, 2)
    _sale(db_session, customer, brakes, 5, 2026, 3)
    _sale(db_session, customer, filters, 3, 2026, 3)
    return brakes, filters


def _save(db_session, seller_user, days_ago):
    summary = crud_summary.save(db_session, [f"hace {days_ago} días"] * 3, 100, seller_user.user_id)
    summary.generated_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    db_session.commit()
    return summary


# --- Las métricas que se le pasan a la IA ---


def test_metrics_compare_the_current_month_projected_to_a_full_month(db_session, sales):
    metrics = build_metrics(db_session, DAY)

    assert metrics["mes_anterior"] == {"mes": "2026-02", "unidades": 20, "facturacion": 20000}
    current = metrics["mes_en_curso"]
    assert current["unidades_hasta_hoy"] == 8
    # 8 unidades en 15 de 31 días: 8 × 31 / 15 = 16,5 a mes completo.
    assert current["unidades_proyectadas_mes_completo"] == 16.5
    assert current["variacion_pct_contra_mes_anterior"] == -17.3


def test_metrics_split_the_categories_that_grow_and_fall(db_session, sales):
    metrics = build_metrics(db_session, DAY)

    assert [c["categoria"] for c in metrics["categorias_que_mas_crecen"]] == ["Filtros"]
    assert metrics["categorias_que_mas_crecen"][0]["variacion_pct"] is None
    assert [c["categoria"] for c in metrics["categorias_que_mas_caen"]] == ["Frenos"]
    assert [p["codigo"] for p in metrics["mas_vendidos_mes_anterior"]] == ["BRK-1"]


def test_metrics_match_the_numbers_of_the_dashboard(client, db_session, seller, sales):
    app.dependency_overrides[today] = lambda: DAY
    trend = client.get("/api/v1/analytics/sales-by-month", headers=seller).json()
    risk = client.get("/api/v1/analytics/stockout-risk?at_risk_only=true", headers=seller).json()

    metrics = build_metrics(db_session, DAY)

    projection = metrics["proyeccion_mes_siguiente"]
    assert (projection["mes"], projection["unidades"]) == (trend["projection"]["month"], trend["projection"]["units"])
    urgent = metrics["riesgo_agotamiento"]["mas_urgentes"]
    assert [p["codigo"] for p in urgent] == [p["part_code"] for p in risk["parts"]]
    assert metrics["riesgo_agotamiento"]["repuestos_riesgo_alto"] == sum(
        p["risk"] == analytics_math.HIGH_RISK for p in risk["parts"]
    )


def test_metrics_lists_follow_the_configured_sizes(db_session, sales, monkeypatch):
    monkeypatch.setattr("app.ia.dashboard_summary.AI_SUMMARY_AT_RISK", 1)
    monkeypatch.setattr("app.ia.dashboard_summary.AI_SUMMARY_BEST_SELLERS", 0)

    metrics = build_metrics(db_session, DAY)

    assert len(metrics["riesgo_agotamiento"]["mas_urgentes"]) <= 1
    assert metrics["mas_vendidos_mes_anterior"] == []


def test_no_customer_data_goes_to_the_ai(client, db_session, seller, customer, sales, ai):
    app.dependency_overrides[today] = lambda: DAY

    assert client.get(SUMMARY, headers=seller).status_code == 200

    (instructions, sent), = ai.orders_list
    for private in [customer.name, customer.email, "Av. Italia", "Visa", "1234"]:
        assert private not in sent
    assert json.loads(sent)["moneda"]


# --- El resumen del día ---


def test_the_first_get_of_the_day_generates_and_saves_the_summary(client, db_session, seller, ai):
    reply = client.get(SUMMARY, headers=seller)

    assert reply.status_code == 200
    assert reply.json()["points"] == POINTS
    # Siempre con zona horaria, para que el navegador muestre la hora de acá.
    assert datetime.fromisoformat(reply.json()["generated_at"]).tzinfo is not None
    assert db_session.query(DashboardSummary).count() == 1
    usage = db_session.query(AIUsage).one()
    assert (usage.funcionalidad, usage.tokens, usage.ok) == ("resumen_dashboard", 900, True)


def test_the_saved_summary_does_not_call_the_ai_again(client, seller, ai):
    first = client.get(SUMMARY, headers=seller).json()
    second = client.get(SUMMARY, headers=seller).json()

    assert second == first
    assert len(ai.orders_list) == 1


def test_a_summary_from_another_day_is_generated_again(client, db_session, seller, seller_user, ai):
    _save(db_session, seller_user, days_ago=1)

    reply = client.get(SUMMARY, headers=seller)

    assert reply.json()["points"] == POINTS
    assert len(ai.orders_list) == 1


def test_refresh_always_generates_a_new_one(client, db_session, seller, ai):
    client.get(SUMMARY, headers=seller)

    assert client.post(SUMMARY, headers=seller).status_code == 200

    assert len(ai.orders_list) == 2
    assert db_session.query(DashboardSummary).count() == 2


@pytest.mark.parametrize("method", ["get", "post"])
def test_if_the_ai_does_not_answer_returns_503_and_saves_nothing(client, db_session, seller, method, caplog):
    app.dependency_overrides[get_ai_client] = ai_down

    reply = getattr(client, method)(SUMMARY, headers=seller)

    assert reply.status_code == 503
    assert "no está disponible" in reply.json()["detail"]
    assert db_session.query(DashboardSummary).count() == 0
    assert db_session.query(AIUsage).one().ok is False
    assert "La IA no respondió" in caplog.text


@pytest.mark.parametrize(
    "texto",
    [
        "no es un JSON",
        json.dumps({"points": ["Solo uno.", "Y dos."]}),
        json.dumps({"points": [f"Punto {i}." for i in range(6)]}),
        json.dumps({"points": ["Uno.", "", "Tres."]}),
    ],
)
def test_an_answer_out_of_format_is_rejected(client, db_session, seller, texto):
    app.dependency_overrides[get_ai_client] = lambda: FakeAIClient(texto=texto)

    assert client.get(SUMMARY, headers=seller).status_code == 503
    assert db_session.query(DashboardSummary).count() == 0


def test_after_the_daily_limit_returns_429_without_calling_the_ai(client, seller, ai, monkeypatch):
    monkeypatch.setattr("app.ia.service.AI_DAILY_LIMIT", 0)

    reply = client.post(SUMMARY, headers=seller)

    assert reply.status_code == 429
    assert "resúmenes" in reply.json()["detail"]
    assert ai.orders_list == []


# --- El historial y la limpieza ---


def test_history_shows_the_last_days_newest_first(client, db_session, seller, seller_user, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.analytics.AI_SUMMARY_HISTORY_DAYS", 5)
    for days_ago in [6, 0, 4]:
        _save(db_session, seller_user, days_ago)
    # El historial no llama a la IA: se ve aunque esté caída.
    app.dependency_overrides[get_ai_client] = ai_down

    reply = client.get(HISTORY, headers=seller)

    assert reply.status_code == 200
    assert reply.json()["days"] == 5
    assert [s["points"][0] for s in reply.json()["summaries"]] == ["hace 0 días", "hace 4 días"]


def test_the_daily_task_deletes_the_summaries_out_of_the_history(client, db_session, seller_user, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.tasks.CRON_SECRET", "secreto")
    for days_ago in [0, 6, 8, 30]:
        _save(db_session, seller_user, days_ago)

    reply = client.get(TASKS, headers={"Authorization": "Bearer secreto"})

    assert reply.json()["Resúmenes viejos borrados"] == 2
    assert db_session.query(DashboardSummary).count() == 2


# --- Permisos ---


@pytest.mark.parametrize(("method", "path"), [("get", SUMMARY), ("post", SUMMARY), ("get", HISTORY)])
def test_the_summary_is_only_for_sellers(client, customer, ai, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers=_headers(customer.user_id, "client")).status_code == 403
    assert ai.orders_list == []
