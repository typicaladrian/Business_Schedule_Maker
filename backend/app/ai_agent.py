import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
from sqlmodel import Session, select
from app.database import engine # Make sure engine is importable from your database.py!
from app.schema import EmployeeDB, CustomRule

load_dotenv()

# --- AI TOOLS ---

def grant_time_off(employee_name: str, day_of_week: str, branch_id: int) -> str:
    """Call this tool when a manager says an employee is sick, on vacation, or needs a specific day off."""
    print(f"\n[SYSTEM ACTION]: Granting {employee_name} time off on {day_of_week} for branch {branch_id}...")
    
    with Session(engine) as session:
        # Fetch all employees for this branch and find the match (case-insensitive)
        employees = session.exec(select(EmployeeDB).where(EmployeeDB.branch_id == branch_id)).all()
        emp = next((e for e in employees if e.name.lower() == employee_name.lower()), None)
        
        if not emp:
            return f"Error: Could not find employee named {employee_name} in this branch."
            
        # Create the new Custom Rule!
        rule = CustomRule(
            rule_type="time_off",
            target_date=day_of_week,
            description=f"{emp.name} requested {day_of_week} off.",
            employee_id=emp.id,
            branch_id=branch_id
        )
        session.add(rule)
        session.commit()
        
        return f"Successfully added a custom rule giving {employee_name} {day_of_week} off. Tell the user it's saved to the Custom Rules dashboard and they should generate a new schedule."

def update_employee_hours(employee_name: str, min_hours: int, max_hours: int, branch_id: int) -> str:
    """Call this tool when a manager wants to change the minimum or maximum weekly hours for an employee."""
    print(f"\n[SYSTEM ACTION]: Updating hours for {employee_name}...")
    
    with Session(engine) as session:
        employees = session.exec(select(EmployeeDB).where(EmployeeDB.branch_id == branch_id)).all()
        emp = next((e for e in employees if e.name.lower() == employee_name.lower()), None)
        
        if not emp:
            return f"Error: Could not find employee named {employee_name} in this branch."
            
        emp.min_hours = min_hours
        emp.max_hours = max_hours
        session.add(emp)
        session.commit()
        
        return f"Successfully updated {employee_name}'s hours to {min_hours}-{max_hours}. Tell the user it is saved!"

def cap_openers(max_openers: int, day_of_week: str, branch_id: int) -> str:
    """
    Call this tool when a manager wants to limit the maximum number of employees opening on a specific day.
    day_of_week should be a specific day (e.g., "Monday") or "All" for everyday.
    """
    print(f"\n[SYSTEM ACTION]: Capping openers to {max_openers} on {day_of_week} for branch {branch_id}...")
    
    with Session(engine) as session:
        rule = CustomRule(
            rule_type="cap_openers",
            target_date=day_of_week,
            description=f"Maximum of {max_openers} openers allowed on {day_of_week}.",
            value=max_openers,
            branch_id=branch_id
        )
        session.add(rule)
        session.commit()
        
        return f"Successfully capped openers to {max_openers} on {day_of_week}. Tell the user it's saved to the Custom Rules dashboard and they should regenerate the schedule."

# --- AI INITIALIZATION ---

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# NEW: We store separate chat histories for every branch so context never leaks!
active_chat_sessions = {}

def process_chat_message(user_message: str, branch_id: int) -> str:
    """Takes a message, routes it to the correct branch's AI brain, and returns the response."""
    print(f"\n[AI AGENT - Branch {branch_id}] Received: {user_message}")
    
    # If this branch doesn't have an active brain yet, create one!
    if branch_id not in active_chat_sessions:
        # We secretly inject the branch ID into the system instructions
        system_instruction = (
            f"You are a helpful branch scheduling assistant. "
            f"You are currently managing Branch ID: {branch_id}. "
            f"You MUST always pass this exact branch_id to your tools. "
            f"Be conversational, professional, and brief."
        )
        
        active_chat_sessions[branch_id] = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[grant_time_off, update_employee_hours, cap_openers],
                temperature=0.0 
            )
        )
    
    # Send the message to Gemini (this will automatically trigger tools if needed)
    response = active_chat_sessions[branch_id].send_message(user_message)
    return response.text