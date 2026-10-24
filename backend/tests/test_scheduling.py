"""End-to-end schedule generation: every returned schedule must satisfy the branch's hard constraints."""
from collections import defaultdict

import pytest

from app import main
from app.ai_agent import build_branch_tools

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def generate(client, headers, branch_id):
    res = client.get(f"/api/branches/{branch_id}/schedule", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["schedule"]["schedule"]


@pytest.fixture
def roster(client, alice, demo_branch):
    headers, _ = alice
    employees = client.get(f"/api/branches/{demo_branch}/employees", headers=headers).json()["employees"]
    return {str(e["id"]): e for e in employees}


def skilled(shifts, roster, skill):
    return [s for s in shifts if skill in roster[s["employee_id"]]["skills"]]


def test_schedule_satisfies_hard_constraints(client, alice, demo_branch, roster):
    headers, _ = alice
    schedule = generate(client, headers, demo_branch)
    hours = defaultdict(float)

    for day in DAYS:
        shifts = schedule[day]
        openers = [s for s in shifts if s["is_opening"]]

        assert len(shifts) >= 3, f"{day}: below minimum headcount"
        assert len({s["employee_id"] for s in shifts}) == len(shifts), f"{day}: someone works two shifts"
        assert skilled(openers, roster, "Combo A"), f"{day}: no Combo A holder opening (dual control)"
        assert skilled(openers, roster, "Combo B"), f"{day}: no Combo B holder opening (dual control)"
        assert skilled(shifts, roster, "Vault"), f"{day}: no vault-certified employee"
        if day == "Monday":
            assert skilled(openers, roster, "ATM"), "Monday: no ATM-certified opener"

        for s in shifts:
            hours[s["employee_id"]] += s["paid_hours"]

    for emp_id, emp in roster.items():
        assert emp["min_hours"] <= hours[emp_id] <= emp["max_hours"], f"{emp['name']} outside contract hours"


def test_time_off_rule_is_enforced(client, alice, demo_branch, roster):
    # The demo seed gives Sarah C. Saturday off
    headers, _ = alice
    sarah_id = next(i for i, e in roster.items() if e["name"] == "Sarah C.")
    schedule = generate(client, headers, demo_branch)
    assert sarah_id not in {s["employee_id"] for s in schedule["Saturday"]}


def test_headcount_cap_from_chat_tool_is_enforced(client, alice, demo_branch):
    headers, _ = alice
    tools = {t.__name__: t for t in build_branch_tools(demo_branch)}
    tools["limit_daily_headcount"](4, "Monday")

    schedule = generate(client, headers, demo_branch)
    assert len(schedule["Monday"]) <= 4


def test_empty_roster_is_rejected(client, alice):
    headers, _ = alice
    branch = client.post("/api/branches", json={"name": "Empty"}, headers=headers).json()
    res = client.get(f"/api/branches/{branch['id']}/schedule", headers=headers)
    assert res.status_code == 400


def test_relaxes_consecutive_openings_until_feasible(client, alice, demo_branch, monkeypatch):
    real_solver = main.generate_schedule
    limits_tried = []

    def infeasible_below_4(payload):
        limits_tried.append(payload.max_consecutive_openings)
        if payload.max_consecutive_openings < 4:
            return {"status": "error", "message": "Infeasible constraints."}
        return real_solver(payload)

    monkeypatch.setattr(main, "generate_schedule", infeasible_below_4)
    headers, _ = alice
    generate(client, headers, demo_branch)

    assert limits_tried == [2, 3, 4]


def test_returns_400_when_no_relaxation_works(client, alice, demo_branch, monkeypatch):
    monkeypatch.setattr(main, "generate_schedule", lambda payload: {"status": "error", "message": "Infeasible constraints."})
    headers, _ = alice
    res = client.get(f"/api/branches/{demo_branch}/schedule", headers=headers)
    assert res.status_code == 400
