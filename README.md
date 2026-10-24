# Secure Operations Scheduling Platform

A full-stack scheduling tool for retail bank branches. Managers describe changes in plain English ("Give Sarah Saturday off", "No more than two openers on Friday"), an LLM agent turns those requests into typed scheduling rules, and a Google OR-Tools constraint solver builds a weekly schedule that satisfies every staffing and security requirement.

**Live demo:** [aischeduler.typicaladrian.dev](https://aischeduler.typicaladrian.dev)

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![OR-Tools](https://img.shields.io/badge/OR--Tools_CP--SAT-4285F4?logo=google&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?logo=googlegemini&logoColor=white)

<!-- Screenshot: add a capture of the dashboard with a generated schedule, e.g. docs/dashboard.png -->

## Why this exists

Bank branch schedules aren't just about covering hours. Every day needs two different people holding the two halves of the vault combination at opening (dual control), someone vault-certified on site, an ATM-certified opener on Mondays, enough closers, and each employee within their contracted hours. Building that by hand every week is slow, and one missed rule is a compliance problem.

This project splits the job into three parts:

- **The LLM handles language.** It can only act through a fixed set of typed tools, so a manager's request becomes a structured rule in the database, never a direct edit to the schedule.
- **The solver handles correctness.** Every rule, plus the branch's baseline requirements, becomes a hard constraint in a CP-SAT model. If a schedule comes back, it satisfies all of them.
- **The API handles trust.** Every request carries a Clerk session token that FastAPI verifies, and every branch, employee and rule is checked against the signed-in manager before it's read or changed.

## Architecture

```mermaid
flowchart LR
    UI["Next.js dashboard<br/>(Clerk sign-in)"] -->|"REST + session JWT"| API["FastAPI<br/>(JWT verification,<br/>ownership checks)"]
    API -->|chat message| LLM["Gemini 2.5 Flash<br/>function calling"]
    LLM -->|typed tool call| Rules[Rule tools]
    Rules --> DB[("PostgreSQL<br/>(Neon)")]
    API <-->|roster, rules| DB
    API -->|Pydantic-validated request| Solver["OR-Tools CP-SAT"]
    Solver -->|weekly schedule| API
    UI -->|client-side| PDF[PDF export]
```

| Layer | Stack |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, Clerk, jsPDF |
| Backend | FastAPI, SQLModel / SQLAlchemy, Pydantic, PyJWT |
| Optimization | Google OR-Tools CP-SAT (C++ core, Python API) |
| AI | Gemini 2.5 Flash via the `google-genai` SDK |
| Data & hosting | PostgreSQL on Neon, frontend on Vercel, backend on Render |

## How it works

### 1. Natural language to validated rules

The chat endpoint routes each message to a Gemini session with function calling enabled and temperature set to 0. The model can call four Python tools (`grant_time_off`, `update_employee_hours`, `cap_openers` and `limit_daily_headcount`), whose typed signatures define exactly what a rule can contain.

- The tools are built per branch with the branch ID fixed on the server. The model never sees or picks a branch ID, so a prompt like "now do this for branch 7" has nothing to act on.
- Tools that name an employee look them up only in that branch's roster, and every rule is stored as a `CustomRule` row scoped to the branch.
- Chat sessions are kept per branch, so one branch's conversation never leaks into another's.
- Rules are visible on the dashboard and can be deleted by the manager before regenerating.

Before solving, the backend loads the roster and rules from Postgres and converts them into Pydantic models with enum-typed skills and locations. Anything that doesn't fit the schema is dropped or rejected before it reaches the solver.

### 2. The constraint model

The solver creates one boolean variable per (employee, day, shift template) across ten weekday shift templates and one Saturday shift. Hard constraints:

| Constraint | Rule |
| --- | --- |
| One shift per day | Each employee works at most one shift per day |
| Contract hours | Weekly paid minutes stay between each employee's min and max, with unpaid lunches already deducted |
| Days per week | No one exceeds their maximum working days |
| Time off | Unavailable days, including AI-created time-off rules, are forced to zero |
| Dual control | A Combo A holder and a Combo B holder must both be on an opening shift every day |
| Vault coverage | At least one vault-certified employee works each day |
| ATM | An ATM-certified employee opens on Mondays |
| Headcount | Daily minimum from branch settings, plus an optional cap set through chat |
| Closing | At least (minimum headcount - 1) employees work a closing shift |
| Opener cap | Optional per-day limit on total openers, set through chat |
| Opening streaks | Rolling-window limit on how many consecutive days one person opens |

The objective puts random weights on opening assignments and the roster is shuffled before each run. CP-SAT is deterministic for a given input, so without this the same people would be picked to open every week. The solver runs with a 10-second time limit.

### 3. Relaxing the softest rule first

Limiting consecutive opening shifts is about fairness, not compliance, so it's the one rule the backend will loosen. Each request first solves with a limit of 2 consecutive openings. If that's infeasible, it retries with 3, then 4, up to 6. Dual control, vault coverage and contract hours are never relaxed. If no schedule exists even then, the API returns a clear error telling the manager to adjust the roster or rules.

### 4. Authentication and authorization

Clerk handles sign-in on the frontend, and the frontend attaches the user's session token to every API call. The backend does not trust anything else the client sends about identity:

- **Token verification.** A FastAPI dependency checks the RS256 signature against Clerk's published JWKS keys, along with the issuer, expiry and `azp` (the site the token was issued to). Missing or invalid tokens get a 401.
- **Identity from the token only.** The manager account is looked up by the token's `sub` claim. Client-supplied IDs, like a `manager_id` or `clerk_id` in a request body, are ignored.
- **Ownership on every route.** Each branch, employee and rule is traced back to its branch and compared with the signed-in manager. Another manager's records return 404, so their existence isn't revealed either.
- **Parameterized queries.** All database access goes through SQLModel, so user input is never concatenated into SQL.

### 5. Branch and roster management

Managers sign in with Clerk, and the backend creates their manager record on first login. From there they can create branches, set minimum daily headcount, and add, edit or remove employees with their skills and contract hours. Deleting a branch also deletes its employees and rules. Finished schedules export to a formatted PDF in the browser.

## Try the live demo

1. Open [aischeduler.typicaladrian.dev](https://aischeduler.typicaladrian.dev) on a desktop browser and sign in with **Manager Login**.
2. Click **Load 1-Click Demo Branch** to seed a staffed branch with mixed skills, contract hours and a sample time-off rule.
3. Click **Generate Schedule**, then try a chat request like "Cap openers at 2 on Friday" and generate again.

The backend runs on a scale-to-zero instance. If branches don't load right away after sign-in, give it about 50 seconds to wake up.

All demo data is generated. No real schedules or employee records are used.

## Running locally

**Prerequisites:** Python 3.10+, Node.js 20+, a PostgreSQL database, a [Gemini API key](https://aistudio.google.com/apikey) and a [Clerk](https://clerk.com) application.

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
DATABASE_URL=postgresql://user:password@host/dbname
GEMINI_API_KEY=your-gemini-key
CLERK_ISSUER=https://your-app.clerk.accounts.dev
```

`CLERK_ISSUER` is your Clerk instance's Frontend API URL, shown under **API keys** in the Clerk dashboard.

```bash
uvicorn app.main:app --reload
```

Tables are created on startup. Interactive API docs are at `http://127.0.0.1:8000/docs`.

**Frontend**

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Project structure

```
backend/
  app/
    main.py        REST API: managers, branches, employees, rules, chat, schedule generation
    auth.py        Clerk JWT verification and branch ownership checks
    solver.py      CP-SAT model: variables, constraints, objective
    ai_agent.py    Gemini tools and per-branch chat sessions
    models.py      Pydantic models for the solver's input
    schema.py      SQLModel tables: Manager, Branch, EmployeeDB, CustomRule
    database.py    Postgres engine and session dependency
  scripts/         Standalone solver and API test harnesses
frontend/
  app/page.tsx     Dashboard: branches, roster, AI chat, schedule view, PDF export
```

## Author

**Adrian Rodriguez** · [LinkedIn](https://www.linkedin.com/in/rpiarodriguez/) · [GitHub](https://github.com/typicaladrian)
