"""Tenant isolation: a signed-in manager can never read or change another manager's branches, employees or rules."""
import pytest

EMPLOYEE_BODY = {"name": "Mallory", "is_full_time": True, "min_hours": 30, "max_hours": 40, "skills": ""}


@pytest.fixture
def alice_records(client, alice, demo_branch):
    headers, _ = alice
    employees = client.get(f"/api/branches/{demo_branch}/employees", headers=headers).json()["employees"]
    rules = client.get(f"/api/branches/{demo_branch}/rules", headers=headers).json()["rules"]
    return {"branch": demo_branch, "employee": employees[0]["id"], "rule": rules[0]["id"]}


# Each entry builds (method, path, json body) from Alice's ids
CROSS_TENANT_REQUESTS = {
    "list branches": lambda ids: ("get", f"/api/branches/{ids['manager']}", None),
    "seed demo branch": lambda ids: ("post", f"/api/managers/{ids['manager']}/seed", None),
    "read roster": lambda ids: ("get", f"/api/branches/{ids['branch']}/employees", None),
    "read rules": lambda ids: ("get", f"/api/branches/{ids['branch']}/rules", None),
    "change settings": lambda ids: ("put", f"/api/branches/{ids['branch']}/settings", {"min_daily_headcount": 1}),
    "generate schedule": lambda ids: ("get", f"/api/branches/{ids['branch']}/schedule", None),
    "add employee": lambda ids: ("post", "/api/employees", {**EMPLOYEE_BODY, "branch_id": ids["branch"]}),
    "edit employee": lambda ids: ("put", f"/api/employees/{ids['employee']}", EMPLOYEE_BODY),
    "delete employee": lambda ids: ("delete", f"/api/employees/{ids['employee']}", None),
    "delete rule": lambda ids: ("delete", f"/api/rules/{ids['rule']}", None),
    "chat as branch": lambda ids: ("post", "/api/chat", {"message": "Give Sarah C. Monday off", "branch_id": ids["branch"]}),
    "delete branch": lambda ids: ("delete", f"/api/branches/{ids['branch']}", None),
}


@pytest.mark.parametrize("action", CROSS_TENANT_REQUESTS)
def test_other_manager_is_blocked(client, alice, bob, alice_records, action):
    method, path, body = CROSS_TENANT_REQUESTS[action]({**alice_records, "manager": alice[1]})

    bob_headers, _ = bob
    res = client.request(method, path, json=body, headers=bob_headers)

    assert res.status_code in (403, 404)


def test_blocked_requests_leave_data_untouched(client, alice, bob, alice_records):
    bob_headers, _ = bob
    client.delete(f"/api/employees/{alice_records['employee']}", headers=bob_headers)
    client.delete(f"/api/branches/{alice_records['branch']}", headers=bob_headers)

    alice_headers, _ = alice
    roster = client.get(f"/api/branches/{alice_records['branch']}/employees", headers=alice_headers)
    assert len(roster.json()["employees"]) == 6


def test_other_managers_branches_look_nonexistent(client, bob, alice_records):
    # 404 rather than 403, so Bob can't even confirm the branch exists
    bob_headers, _ = bob
    res = client.get(f"/api/branches/{alice_records['branch']}/employees", headers=bob_headers)
    assert res.status_code == 404


def test_owner_can_delete_branch_and_its_data(client, alice, alice_records):
    headers, manager_id = alice
    assert client.delete(f"/api/branches/{alice_records['branch']}", headers=headers).status_code == 200
    assert client.get(f"/api/branches/{manager_id}", headers=headers).json()["branches"] == []
