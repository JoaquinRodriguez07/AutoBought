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

# In-memory SQLite for testing. Each test will have an isolated database instance.
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

# StaticPool is required for in-memory SQLite to share the same connection across threads
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Creates a fresh database on each test case."""
    # Create all tables before the test runs
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop all tables after the test finishes
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    """
    Create a TestClient that uses the `db_session` fixture 
    to override the `get_db` dependency.
    """
    def override_get_db():
        yield db_session

    # Swap out the real get_db for our test database
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
        
    # Clear the overrides to ensure tests remain isolated
    app.dependency_overrides.clear()