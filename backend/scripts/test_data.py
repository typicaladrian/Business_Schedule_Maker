import sys
import os

# Ensure Python can find the backend module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from backend.app.models import Employee, Location, Skill, DailyRequirement, ScheduleRequestPayload, ShiftTemplate
from backend.app.solver import generate_schedule
import json

# --- 1. THE FULL EMPLOYEE ROSTER ---

employees = [
    # PARAMUS EMPLOYEES
    Employee(id="emp_01", name="Adrian", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_A], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5),
    Employee(id="emp_02", name="Gilda", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_B, Skill.VAULT], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5),
    Employee(id="emp_03", name="Hefzi", home_location=Location.PARAMUS, is_full_time=False, skills=[Skill.COMBO_A], min_hours_per_week=25, max_hours_per_week=30, max_days_per_week=4),
    Employee(id="emp_04", name="Kristina", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_B, Skill.VAULT], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5, unavailable_days=["Saturday"]),
    Employee(id="emp_05", name="Melissa", home_location=Location.PARAMUS, is_full_time=False, skills=[Skill.COMBO_B], min_hours_per_week=25, max_hours_per_week=30, max_days_per_week=4),
    Employee(id="emp_06", name="Khi", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_B], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5),
    Employee(id="emp_07", name="Nick", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_B, Skill.ATM], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5, required_work_days=["Monday"]),
    Employee(id="emp_08", name="Alma", home_location=Location.PARAMUS, is_full_time=True, skills=[Skill.COMBO_A], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5),

    # RIDGEWOOD EMPLOYEES
    Employee(id="emp_09", name="Eva", home_location=Location.RIDGEWOOD, is_full_time=False, skills=[Skill.COMBO_B], min_hours_per_week=15, max_hours_per_week=21, max_days_per_week=4),
    Employee(id="emp_10", name="Joe P", home_location=Location.RIDGEWOOD, is_full_time=True, skills=[Skill.COMBO_A, Skill.VAULT], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5, required_work_days=["Saturday"]),
    Employee(id="emp_11", name="Jose", home_location=Location.RIDGEWOOD, is_full_time=True, skills=[Skill.COMBO_B, Skill.VAULT], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5, required_work_days=["Saturday"]),
    Employee(id="emp_12", name="Tan", home_location=Location.RIDGEWOOD, is_full_time=True, skills=[Skill.COMBO_A, Skill.ATM], min_hours_per_week=38, max_hours_per_week=40, max_days_per_week=5, required_work_days=["Monday"]),
    Employee(id="emp_13", name="Laurence", home_location=Location.RIDGEWOOD, is_full_time=False, skills=[Skill.COMBO_A], min_hours_per_week=25, max_hours_per_week=30, max_days_per_week=4),
]

# --- 2. THE FULL WEEK REQUIREMENTS & SHIFTS ---

weekday_shifts = [
    # Standard Full Shifts
    ShiftTemplate(id="open_800_1730", start_time="08:00", end_time="17:30", paid_minutes=540, is_opening_shift=True),
    ShiftTemplate(id="mid_815_1730", start_time="08:15", end_time="17:30", paid_minutes=525, is_opening_shift=False),
    ShiftTemplate(id="mid_830_1730", start_time="08:30", end_time="17:30", paid_minutes=510, is_opening_shift=False),
    
    # "Kristina / Early Leave" Shift - 6 paid hours. 
    ShiftTemplate(id="short_800_1430", start_time="08:00", end_time="14:30", paid_minutes=360, is_opening_shift=True), 
    
    # "Melissa" Shift - 6.5 paid hours (leaves strictly at 3:30 PM)
    ShiftTemplate(id="pt_830_1530", start_time="08:30", end_time="15:30", paid_minutes=390, is_opening_shift=False)
]

saturday_shifts = [
    ShiftTemplate(id="sat_830_1230", start_time="08:30", end_time="12:30", paid_minutes=240, is_opening_shift=True)
]

# Build the daily requirements loop that went missing!
days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
daily_reqs = []

for day in days_of_week:
    shifts_to_use = saturday_shifts if day == "Saturday" else weekday_shifts
    
    daily_reqs.append(DailyRequirement(
        day_of_week=day, 
        location=Location.PARAMUS, 
        min_headcount=5,
        allowed_shifts=shifts_to_use
    ))
    daily_reqs.append(DailyRequirement(
        day_of_week=day, 
        location=Location.RIDGEWOOD, 
        min_headcount=3,
        allowed_shifts=shifts_to_use
    ))

# --- 3. MASTER PAYLOAD ---
payload = ScheduleRequestPayload(
    week_start_date="2026-03-16",
    employees=employees,
    daily_requirements=daily_reqs
)

if __name__ == "__main__":
    print("Sending payload to solver...\n")
    generate_schedule(payload)