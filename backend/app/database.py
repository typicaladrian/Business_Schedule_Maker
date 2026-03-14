import os
from backend.app.models import ScheduleRequestPayload
from backend.scripts.test_data import payload as initial_payload

# This creates a file named 'db.json' right next to this script
DB_FILE = os.path.join(os.path.dirname(__file__), "db.json")

def load_db() -> ScheduleRequestPayload:
    """Loads the database from the JSON file. If it doesn't exist, it creates it using your test_data."""
    if not os.path.exists(DB_FILE):
        print("📁 No database found. Creating a new one from test_data...")
        save_db(initial_payload)
        return initial_payload
        
    # Read the JSON file and convert it back into our Pydantic Python object
    with open(DB_FILE, "r") as f:
        json_data = f.read()
        return ScheduleRequestPayload.model_validate_json(json_data)

def save_db(payload: ScheduleRequestPayload):
    """Saves the current Python state directly to the JSON file on your hard drive."""
    with open(DB_FILE, "w") as f:
        # Write the data beautifully indented so it's easy for humans to read
        f.write(payload.model_dump_json(indent=2))