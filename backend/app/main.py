from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from backend.app.models import Employee, DailyRequirement, ShiftTemplate, Location, ScheduleRequestPayload
from backend.app.solver import generate_schedule
from pydantic import BaseModel
# from backend.app.ai_agent import process_chat_message
import traceback
from contextlib import asynccontextmanager
from backend.app.database import create_db_and_tables
from pydantic import BaseModel
from sqlmodel import Session, select
from fastapi import Depends
from backend.app.schema import Manager, Branch, EmployeeDB
from backend.app.database import get_session


app = FastAPI(title="Bank Scheduler API")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Building SQL Database Tables...")
    create_db_and_tables()
    yield

# Update your FastAPI app initialization to include the lifespan
app = FastAPI(title="Bank Scheduler API", lifespan=lifespan)

# NEW: Enable CORS so our Next.js frontend can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Next.js runs on port 3000
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Bank Scheduler API is running."}

@app.post("/generate-schedule")
def create_schedule(payload: ScheduleRequestPayload):
    # Pass the incoming JSON payload directly to our OR-Tools solver
    result = generate_schedule(payload)
    
    if result["status"] == "success":
        return result
    else:
        # If the solver fails, return a 400 Bad Request error
        raise HTTPException(status_code=400, detail=result["message"])

# The payload we expect from the frontend
class ManagerSyncPayload(BaseModel):
    clerk_id: str
    email: str

@app.post("/api/managers/sync")
def sync_manager(payload: ManagerSyncPayload, session: Session = Depends(get_session)):
    """Checks if a manager exists. If not, creates them in the database."""
    
    # 1. Search the database for this Clerk ID
    statement = select(Manager).where(Manager.clerk_id == payload.clerk_id)
    manager = session.exec(statement).first()
    
    # 2. If they don't exist, create a new record!
    if not manager:
        print(f"👤 New Manager Detected! Creating account for: {payload.email}")
        manager = Manager(clerk_id=payload.clerk_id, email=payload.email)
        session.add(manager)
        session.commit()
        session.refresh(manager)
    else:
        print(f"✅ Existing Manager Logged In: {manager.email}")
        
    # 3. Return the internal database ID so the frontend can use it
    return {"manager_id": manager.id, "email": manager.email}

# ==========================================================================

class BranchCreatePayload(BaseModel):
    name: str
    manager_id: int

@app.post("/api/branches")
def create_branch(payload: BranchCreatePayload, session: Session = Depends(get_session)):
    """Creates a new branch assigned to the logged-in manager."""
    new_branch = Branch(name=payload.name, manager_id=payload.manager_id)
    session.add(new_branch)
    session.commit()
    session.refresh(new_branch)
    return new_branch

@app.get("/api/branches/{manager_id}")
def get_branches(manager_id: int, session: Session = Depends(get_session)):
    """Fetches all branches owned by this manager."""
    statement = select(Branch).where(Branch.manager_id == manager_id)
    branches = session.exec(statement).all()
    return {"branches": branches}

# ===============================================================================

class EmployeeCreatePayload(BaseModel):
    name: str
    is_full_time: bool
    min_hours: int
    max_hours: int
    branch_id: int

@app.post("/api/employees")
def create_employee(payload: EmployeeCreatePayload, session: Session = Depends(get_session)):
    """Hires a new employee and assigns them to a branch."""
    new_employee = EmployeeDB(
        name=payload.name,
        is_full_time=payload.is_full_time,
        min_hours=payload.min_hours,
        max_hours=payload.max_hours,
        branch_id=payload.branch_id
    )
    session.add(new_employee)
    session.commit()
    session.refresh(new_employee)
    return new_employee

@app.get("/api/branches/{branch_id}/employees")
def get_branch_employees(branch_id: int, session: Session = Depends(get_session)):
    """Fetches the entire employee roster for a specific branch."""
    statement = select(EmployeeDB).where(EmployeeDB.branch_id == branch_id)
    employees = session.exec(statement).all()
    return {"employees": employees}

# ================================================================================

class EmployeeUpdatePayload(BaseModel):
    name: str
    is_full_time: bool
    min_hours: int
    max_hours: int

@app.put("/api/employees/{employee_id}")
def update_employee(employee_id: int, payload: EmployeeUpdatePayload, session: Session = Depends(get_session)):
    """Modifies an existing employee."""
    emp = session.get(EmployeeDB, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    emp.name = payload.name
    emp.is_full_time = payload.is_full_time
    emp.min_hours = payload.min_hours
    emp.max_hours = payload.max_hours
    
    session.add(emp)
    session.commit()
    session.refresh(emp)
    return emp

@app.delete("/api/employees/{employee_id}")
def delete_employee(employee_id: int, session: Session = Depends(get_session)):
    """Fires (deletes) an employee from the database."""
    emp = session.get(EmployeeDB, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    session.delete(emp)
    session.commit()
    return {"message": "Employee successfully fired"}

# ================================================================================

@app.get("/api/branches/{branch_id}/schedule")
def generate_branch_schedule(branch_id: int, session: Session = Depends(get_session)):
    """Pulls the roster from SQL, formats it to Pydantic models, and runs the Math Engine."""
    
    # 1. Fetch the branch and its employees
    branch = session.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found.")
        
    statement = select(EmployeeDB).where(EmployeeDB.branch_id == branch_id)
    employees = session.exec(statement).all()
    
    if not employees:
        raise HTTPException(status_code=400, detail="Cannot generate a schedule with an empty roster!")

    # 2. Map Branch Name to the strict Location Enum
    try:
        loc_enum = Location(branch.name)
    except ValueError:
        loc_enum = Location.PARAMUS # Safe fallback just in case
        
    # 3. Translate SQL Employees -> Pydantic Employees
    pydantic_employees = []
    for emp in employees:
        pydantic_employees.append(Employee(
            id=str(emp.id),
            name=emp.name,
            home_location=loc_enum,
            is_full_time=emp.is_full_time,
            skills=[], 
            min_hours_per_week=float(emp.min_hours),
            max_hours_per_week=float(emp.max_hours),
            max_days_per_week=5,
            required_work_days=[],
            unavailable_days=emp.unavailable_days.split(",") if emp.unavailable_days else []
        ))

    # 4. Define Default Shifts (The times people are allowed to work)
    default_shifts = [
        ShiftTemplate(id="open", start_time="08:00", end_time="17:00", paid_minutes=480, is_opening_shift=True),
        ShiftTemplate(id="mid", start_time="09:00", end_time="18:00", paid_minutes=480, is_opening_shift=False)
    ]

    # 5. Define Daily Requirements for the Solver
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    daily_reqs = []
    for d in days:
        daily_reqs.append(DailyRequirement(
            day_of_week=d,
            location=loc_enum,
            min_headcount=2, # Need at least 2 people a day
            # Setting these to 0 temporarily since we haven't assigned skills in the UI yet!
            requires_combo_a_open=0, 
            requires_combo_b_open=0,
            requires_vault=0,
            allowed_shifts=default_shifts
        ))

    # 6. Build the final payload and run the solver!
    try:
        payload = ScheduleRequestPayload(
            week_start_date="2026-03-16",
            employees=pydantic_employees,
            daily_requirements=daily_reqs
        )
        
        schedule = generate_schedule(payload)
        
        # --- NEW FIX: Catch the Math Engine's text errors! ---
        if isinstance(schedule, str):
            raise HTTPException(status_code=400, detail=f"Math Engine Failed: {schedule}")
        # -----------------------------------------------------
            
        return {"schedule": schedule}
    except HTTPException:
        raise # Let our specific HTTP exceptions pass through cleanly
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))