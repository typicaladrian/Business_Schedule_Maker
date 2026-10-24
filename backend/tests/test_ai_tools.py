"""The LLM's tools: what the model can see, and where its writes land."""
import inspect

import pytest
from google.genai import types
from sqlmodel import Session, select

from app.ai_agent import build_branch_tools
from app.database import engine
from app.schema import Branch, CustomRule, EmployeeDB


def tools_by_name(branch_id):
    return {tool.__name__: tool for tool in build_branch_tools(branch_id)}


def rules_for(branch_id):
    with Session(engine) as session:
        return session.exec(select(CustomRule).where(CustomRule.branch_id == branch_id)).all()


def test_all_four_tools_are_registered():
    assert set(tools_by_name(1)) == {"grant_time_off", "update_employee_hours", "cap_openers", "limit_daily_headcount"}


@pytest.mark.parametrize("tool", build_branch_tools(1), ids=lambda t: t.__name__)
def test_model_never_sees_a_branch_id(tool):
    assert "branch_id" not in inspect.signature(tool).parameters
    declaration = types.FunctionDeclaration.from_callable_with_api_option(callable=tool)
    assert "branch_id" not in str(declaration.parameters)


def test_rules_land_in_the_bound_branch(demo_branch):
    before = len(rules_for(demo_branch))
    tools_by_name(demo_branch)["limit_daily_headcount"](4, "Monday")

    rules = rules_for(demo_branch)
    assert len(rules) == before + 1
    assert any(r.rule_type == "max_headcount" and r.value == 4 and r.target_date == "Monday" for r in rules)


def test_cannot_reach_employees_in_another_branch(demo_branch):
    # A second branch whose roster does not include Sarah
    with Session(engine) as session:
        other = Branch(name="Ridgewood", manager_id=None)
        session.add(other)
        session.commit()
        other_id = other.id

    result = tools_by_name(other_id)["grant_time_off"]("Sarah C.", "Friday")

    assert result.startswith("Error")
    assert rules_for(other_id) == []


def test_update_hours_changes_only_that_employee(demo_branch):
    tools_by_name(demo_branch)["update_employee_hours"]("Sarah C.", 20, 28)

    with Session(engine) as session:
        sarah = session.exec(select(EmployeeDB).where(EmployeeDB.name == "Sarah C.")).one()
    assert (sarah.min_hours, sarah.max_hours) == (20, 28)
