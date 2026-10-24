import os
import tempfile
import time
from types import SimpleNamespace

# Point the app at a throwaway SQLite file and a fake Clerk issuer BEFORE anything imports it,
# so tests can never touch the real Neon database or call real Clerk/Gemini.
TEST_DB_PATH = os.path.join(tempfile.mkdtemp(), "test.db")
TEST_ISSUER = "https://test-instance.clerk.accounts.dev"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["CLERK_ISSUER"] = TEST_ISSUER
os.environ["GEMINI_API_KEY"] = "test-key-not-used"

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

from app import auth
from app.database import engine
from app.main import app

# Stand-ins for Clerk's signing key and an attacker's key
CLERK_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ATTACKER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def make_token(sub, key=CLERK_KEY, iss=TEST_ISSUER, azp="http://localhost:3000", expires_in=60):
    """Builds a session token shaped like the ones Clerk issues."""
    now = int(time.time())
    claims = {"sub": sub, "iss": iss, "azp": azp, "iat": now, "nbf": now, "exp": now + expires_in}
    return jwt.encode(claims, key, algorithm="RS256")


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch):
    """Serve our test public key instead of fetching Clerk's JWKS over the network."""
    monkeypatch.setattr(
        auth.jwks_client,
        "get_signing_key_from_jwt",
        lambda token: SimpleNamespace(key=CLERK_KEY.public_key()),
    )


@pytest.fixture(autouse=True)
def fresh_db():
    """Every test starts with empty tables."""
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def sign_in(client, clerk_id):
    """Syncs a manager the way the frontend does on login. Returns (auth headers, manager_id)."""
    headers = bearer(make_token(clerk_id))
    res = client.post("/api/managers/sync", json={"email": f"{clerk_id}@example.com"}, headers=headers)
    assert res.status_code == 200
    return headers, res.json()["manager_id"]


@pytest.fixture
def alice(client):
    return sign_in(client, "user_alice")


@pytest.fixture
def bob(client):
    return sign_in(client, "user_bob")


@pytest.fixture
def demo_branch(client, alice):
    """Alice's seeded demo branch: 6 employees and one time-off rule. Returns its id."""
    headers, manager_id = alice
    res = client.post(f"/api/managers/{manager_id}/seed", headers=headers)
    assert res.status_code == 200
    return res.json()["branch"]["id"]
