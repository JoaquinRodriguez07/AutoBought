"""Fixtures comunes: base SQLite en memoria, cliente HTTP y mails falsos."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(BACKEND_DIR))

from backend.main import app
from app import models
from app.db.base import Base
from app.api.deps import get_db

# SQLite en memoria para los tests: cada test tiene su propia base.
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

# StaticPool hace falta para que la SQLite en memoria comparta la conexión entre hilos.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Una base nueva para cada test."""
    # Se crean las tablas antes del test
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # y se borran al terminar.
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    """Un TestClient que usa la base de `db_session` en lugar de `get_db`."""
    def override_get_db():
        yield db_session

    # Se cambia el get_db real por la base del test.
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
        
    # Se sacan los reemplazos para que los tests no se afecten entre sí.
    app.dependency_overrides.clear()

@pytest.fixture(autouse=True)
def mercadopago_configurado(monkeypatch):
    """Los tests compran con un token falso: sin token, POST /orders da 503.
    Igual nadie llama a Mercado Pago (ver el cliente falso de pago_test.py)."""
    monkeypatch.setattr("app.core.config.MERCADOPAGO_ACCESS_TOKEN", "TEST-token-de-los-tests")


@pytest.fixture(autouse=True)
def sent_mails(monkeypatch):
    """Ningún test manda mails reales: el envío SMTP se reemplaza por una
    lista con los mensajes que se habrían mandado."""
    sent = []
    monkeypatch.setattr("app.core.email._send_smtp", sent.append)
    return sent
