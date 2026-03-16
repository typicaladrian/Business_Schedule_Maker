from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from backend.app.models import Employee, DailyRequirement, ShiftTemplate, Location, ScheduleRequestPayload, Skill
from backend.app.solver import generate_schedule
from pydantic import BaseModel
import traceback
from contextlib import asynccontextmanager
from backend.app.database import create_db_and_tables
from pydantic import BaseModel
from sqlmodel import Session, select
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
# BRANCH SETTINGS ENDPOINT

class BranchSettingsPayload(BaseModel):
    min_daily_headcount: int

@app.put("/api/branches/{branch_id}/settings")
def update_branch_settings(branch_id: int, payload: BranchSettingsPayload, session: Session = Depends(get_session)):
    """Updates the specific settings for a branch."""
    branch = session.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    branch.min_daily_headcount = payload.min_daily_headcount
    session.add(branch)
    session.commit()
    session.refresh(branch)
    return branch

# ===============================================================================

class EmployeeCreatePayload(BaseModel):
    name: str
    is_full_time: bool
    min_hours: int
    max_hours: int
    branch_id: int
    skills: str = ""

@app.post("/api/employees")
def create_employee(payload: EmployeeCreatePayload, session: Session = Depends(get_session)):
    """Hires a new employee and assigns them to a branch."""
    new_employee = EmployeeDB(
        name=payload.name,
        is_full_time=payload.is_full_time,
        min_hours=payload.min_hours,
        max_hours=payload.max_hours,
        branch_id=payload.branch_id,
        skills=payload.skills
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
    skills: str = ""

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
    emp.skills = payload.skills
    
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
        # Translate comma-separated string back to Skill Enums
        parsed_skills = []
        if emp.skills:
            for s in emp.skills.split(","):
                try:
                    parsed_skills.append(Skill(s.strip()))
                except ValueError:
                    continue # Skip if there's a typo in the DB

        pydantic_employees.append(Employee(
            id=str(emp.id),
            name=emp.name,
            home_location=loc_enum,
            is_full_time=emp.is_full_time,
            skills=parsed_skills, # THE FIX: Hand the solver the real skills!
            min_hours_per_week=float(emp.min_hours),
            max_hours_per_week=float(emp.max_hours),
            max_days_per_week=5,
            required_work_days=[],
            unavailable_days=emp.unavailable_days.split(",") if emp.unavailable_days else []
        ))

    # 4. Define Default Shifts (The times people are allowed to work)
    # Note: Paid minutes subtract a 30-minute unpaid lunch where applicable
    weekday_shifts = [
        # 8:00 AM - 5:30 PM (9 paid hours -> 540 minutes)
        ShiftTemplate(id="open_800", start_time="08:00", end_time="17:30", paid_minutes=540, is_opening_shift=True),
        
        # 8:15 AM - 5:30 PM (8.75 paid hours -> 525 minutes)
        ShiftTemplate(id="mid_815", start_time="08:15", end_time="17:30", paid_minutes=525, is_opening_shift=False),
        
        # 8:30 AM - 5:30 PM (8.5 paid hours -> 510 minutes)
        ShiftTemplate(id="mid_830", start_time="08:30", end_time="17:30", paid_minutes=510, is_opening_shift=False)
    ]
    
    # Saturday has exactly one shift, and it acts as the opening shift!
    # 8:30 AM - 12:30 PM (4 paid hours -> 240 minutes)
    saturday_shifts = [
        ShiftTemplate(id="sat_open_830", start_time="08:30", end_time="12:30", paid_minutes=240, is_opening_shift=True)
    ]

    # 5. Define Daily Requirements for the Solver
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] 
    daily_reqs = []
    
    for d in days:
        daily_reqs.append(DailyRequirement(
            day_of_week=d,
            location=loc_enum,
            min_headcount=branch.min_daily_headcount,
            requires_combo_a_open=1,
            requires_combo_b_open=1,
            requires_vault=1, 
            requires_atm_open=1 if d == "Monday" else 0, # Only demand an ATM opener on Monday!
            allowed_shifts=saturday_shifts if d == "Saturday" else weekday_shifts
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