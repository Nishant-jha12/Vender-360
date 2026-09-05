"""Test fixtures: a throwaway SQLite database and an authenticated client.

Requires the full requirements (pip install -r requirements.txt).
tests/test_crypto.py has no such dependency and runs on its own.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-the-suite")
os.environ.setdefault("DEBUG_OTP", "true")
os.environ.setdefault("DEMO_MODE", "true")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import models  # noqa: E402
import ratelimit  # noqa: E402
from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Counters are process-wide, so one test's attempts would otherwise
    throttle the next one."""
    ratelimit.reset()
    yield
    ratelimit.reset()


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # keeps the in-memory DB alive across connections
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def sign_in(client, **overrides):
    """Sign up and complete the OTP step, returning (headers, vendor_id).

    The second step consumes the challenge token from the first, which is what
    binds it to the password -- a vendor_id alone is deliberately not enough.
    """
    payload = {
        "name": "Test Owner",
        "username": "testowner",
        "email": "test@example.com",
        "phone": "+91 9000000000",
        "password": "a-good-password",
    }
    payload.update(overrides)

    signup = client.post("/api/auth/signup", json=payload)
    assert signup.status_code == 200, signup.text
    body = signup.json()

    verify = client.post(
        "/api/auth/verify-otp",
        json={"challenge_token": body["challenge_token"], "otp": "123456"},
    )
    assert verify.status_code == 200, verify.text

    return {"Authorization": f"Bearer {verify.json()['token']}"}, body["vendor_id"]


@pytest.fixture
def vendor(client):
    """A signed-up, verified vendor. Returns (headers, vendor_id)."""
    return sign_in(client)


@pytest.fixture
def item(client, vendor):
    headers, _ = vendor
    response = client.post(
        "/api/inventory",
        headers=headers,
        json={
            "sku_name": "Test Milk 500ml",
            "category": "Dairy",
            "unit": "packets",
            "current_qty": 20,
            "reorder_point": 5,
            "cost_price": 27.0,
            "selling_price": 33.0,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
