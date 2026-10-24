"""Session token verification: only valid Clerk tokens get through, and identity comes from the token alone."""
import pytest
from conftest import ATTACKER_KEY, bearer, make_token


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no token"),
        pytest.param(bearer("not.a.jwt"), id="garbage token"),
        pytest.param(bearer(make_token("user_alice", key=ATTACKER_KEY)), id="signed by wrong key"),
        pytest.param(bearer(make_token("user_alice", expires_in=-60)), id="expired"),
        pytest.param(bearer(make_token("user_alice", iss="https://evil.example")), id="wrong issuer"),
        pytest.param(bearer(make_token("user_alice", azp="https://evil.example")), id="issued to another site"),
    ],
)
def test_rejects_invalid_tokens(client, alice, headers):
    _, manager_id = alice
    res = client.get(f"/api/branches/{manager_id}", headers=headers)
    assert res.status_code == 401


def test_valid_token_for_unsynced_user_is_forbidden(client):
    res = client.get("/api/branches/1", headers=bearer(make_token("user_never_synced")))
    assert res.status_code == 403


def test_health_check_is_public(client):
    assert client.get("/").status_code == 200


def test_raw_solver_endpoint_requires_token(client):
    assert client.post("/generate-schedule", json={}).status_code == 401


def test_sync_uses_token_identity_not_request_body(client, bob):
    # Alice's token, but the body claims to be Bob
    res = client.post(
        "/api/managers/sync",
        json={"email": "alice@example.com", "clerk_id": "user_bob"},
        headers=bearer(make_token("user_alice")),
    )
    _, bob_id = bob
    assert res.status_code == 200
    assert res.json()["manager_id"] != bob_id


def test_sync_is_idempotent(client, alice):
    headers, manager_id = alice
    res = client.post("/api/managers/sync", json={"email": "alice@example.com"}, headers=headers)
    assert res.json()["manager_id"] == manager_id


def test_create_branch_ignores_manager_id_in_body(client, alice, bob):
    headers, alice_id = alice
    _, bob_id = bob
    res = client.post("/api/branches", json={"name": "Ridgewood", "manager_id": bob_id}, headers=headers)
    assert res.status_code == 200
    assert res.json()["manager_id"] == alice_id
