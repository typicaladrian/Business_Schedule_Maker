from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.app.models import ScheduleRequestPayload
from backend.app.solver import generate_schedule
from pydantic import BaseModel
# from backend.app.ai_agent import process_chat_message
import traceback
from contextlib import asynccontextmanager
from backend.app.database import create_db_and_tables

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

# @app.get("/api/employees")
# def get_employees():
#     """Fetches the current live employee database rules."""
#     current_db = load_db()
#     # We return the employees so the frontend can display their current rules
#     return {"employees": current_db.employees}

# # Create a simple GET endpoint for the frontend to hit
# @app.get("/api/test-schedule")
# def get_test_schedule():
#     # Load the persistent database
#     current_db = load_db()
    
#     # Pass it to the solver
#     result = generate_schedule(current_db)
    
#     if result["status"] == "success":
#         return result
#     else:
#         raise HTTPException(status_code=400, detail=result["message"])
    
# class ChatMessage(BaseModel):
#     message: str

# @app.post("/api/chat")
# def chat_with_ai(payload: ChatMessage):
#     try:
#         reply = process_chat_message(payload.message)
#         return {"reply": reply}
#     except Exception as e:
#         # NEW: Force the server to print the exact crash log to the terminal!
#         print("\n❌ AI AGENT CRASH LOG:")
#         traceback.print_exc() 
#         print("-" * 40 + "\n")
#         raise HTTPException(status_code=500, detail=str(e))