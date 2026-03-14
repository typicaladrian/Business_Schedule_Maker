import os
import requests
from google import genai
from google.genai import types
from dotenv import load_dotenv
from backend.app.database import load_db, save_db

load_dotenv()

# --- AI TOOLS ---

def mark_employee_sick(employee_name: str, day_of_week: str) -> str:
    """Call this tool when a manager says an employee is sick or needs a day off."""
    print(f"\n[SYSTEM ACTION]: Finding {employee_name} to mark unavailable on {day_of_week}...")
    
    # 1. Load the live database from the hard drive
    current_payload = load_db()
    
    found = False
    for emp in current_payload.employees:
        if emp.name.lower() == employee_name.lower():
            if day_of_week not in emp.unavailable_days:
                emp.unavailable_days.append(day_of_week)
            found = True
            break
            
    if found:
        # 2. SAVE the change permanently to the hard drive!
        save_db(current_payload)
        return f"Successfully updated the database. {employee_name} is now off on {day_of_week}. You MUST ask the user if they want to regenerate the schedule now."
    else:
        return f"Error: Could not find employee named {employee_name}."

def regenerate_schedule() -> str:
    """Call this tool to run the OR-Tools scheduling solver and generate a new schedule."""
    print("\n[SYSTEM ACTION]: Sending updated rules to the local FastAPI Solver...")
    
    # 1. Load the freshest data from the hard drive
    current_payload = load_db()
    
    url = "http://127.0.0.1:8000/generate-schedule"
    try:
        response = requests.post(url, json=current_payload.model_dump())
        if response.status_code == 200:
            return "Schedule generated successfully! Tell the user the math engine found a valid schedule and it is ready to view."
        else:
            return f"The solver failed to find a schedule with the new rules. Error: {response.json().get('detail')}"
    except requests.exceptions.ConnectionError:
        return "CRITICAL ERROR: Could not connect to the FastAPI server."

def update_employee_hours(employee_name: str, min_hours: int | None = None, max_hours: int | None = None) -> str:
    """
    Call this tool when a manager wants to change the minimum or maximum weekly hours for an employee.
    
    Args:
        employee_name: The first name of the employee.
        min_hours: The new minimum weekly hours (optional).
        max_hours: The new maximum weekly hours (optional).
    """
    print(f"\n[SYSTEM ACTION]: Updating hours for {employee_name}...")
    
    # Load the live database
    current_payload = load_db()
    
    found = False
    for emp in current_payload.employees:
        if emp.name.lower() == employee_name.lower():
            if min_hours is not None:
                emp.min_hours_per_week = min_hours
            if max_hours is not None:
                emp.max_hours_per_week = max_hours
            found = True
            break
            
    if found:
        # Save the change permanently
        save_db(current_payload)
        return f"Successfully updated {employee_name}'s hours in the database. Min is now {min_hours}, Max is now {max_hours}. You MUST ask the user if they want to regenerate the schedule."
    else:
        return f"Error: Could not find employee named {employee_name}."

def remove_employee_time_off(employee_name: str, day_of_week: str) -> str:
    """Call this tool when a manager says an employee is no longer sick and can work on a specific day."""
    print(f"\n[SYSTEM ACTION]: Removing {day_of_week} from {employee_name}'s unavailable days...")
    
    current_payload = load_db()
    found = False
    
    for emp in current_payload.employees:
        if emp.name.lower() == employee_name.lower():
            found = True
            # Filter out the specific day (case-insensitive)
            emp.unavailable_days = [
                day for day in emp.unavailable_days 
                if day.lower() != day_of_week.lower()
            ]
            break
            
    if found:
        save_db(current_payload)
        return f"Successfully updated the database. {employee_name} is now available to work on {day_of_week}. Ask the user if they want to regenerate the schedule."
    else:
        return f"Error: Could not find employee named {employee_name}."

# --- AI INITIALIZATION ---

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# We create a global chat session so the AI remembers the conversation history 
# as long as the FastAPI server is running.
chat_session = client.chats.create(
    model="gemini-2.5-flash",
    config=types.GenerateContentConfig(
        tools=[
            mark_employee_sick, 
            remove_employee_time_off, 
            update_employee_hours, 
            regenerate_schedule
        ],
        temperature=0.0 
    )
)

def process_chat_message(user_message: str) -> str:
    """Takes a message from the FastAPI endpoint, sends it to Gemini, and returns the text."""
    print(f"\n[AI AGENT] Received message from frontend: {user_message}")
    
    # Send the message to Gemini (this will automatically trigger tools if needed)
    response = chat_session.send_message(user_message)
    
    return response.text