from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class Location(str, Enum):
    PARAMUS = "Paramus"
    RIDGEWOOD = "Ridgewood"

class Skill(str, Enum):
    COMBO_A = "Combo A"
    COMBO_B = "Combo B"
    VAULT = "Vault"
    ATM = "ATM"

class Employee(BaseModel):
    id: str
    name: str
    home_location: Location
    is_full_time: bool
    skills: List[Skill] = Field(default_factory=list)
    min_hours_per_week: float
    max_hours_per_week: float
    max_days_per_week: int
    required_work_days: List[str] = Field(default_factory=list)
    unavailable_days: List[str] = Field(default_factory=list)

# NEW: Defines a specific block of time an employee can work
class ShiftTemplate(BaseModel):
    id: str
    start_time: str
    end_time: str
    paid_minutes: int # e.g., 9 hours = 540 mins (pre-calculated with lunch deduction if applicable)
    is_opening_shift: bool = False
    is_closing_shift: bool = False

# UPDATED: Now includes the specific shifts available for this day
class DailyRequirement(BaseModel):
    day_of_week: str
    location: Location
    min_headcount: int
    requires_combo_a_open: int = 1
    requires_combo_b_open: int = 1
    requires_vault: int = 1
    requires_atm_open: int = 0  # Defaults to 0 so we don't accidentally require it every day!
    max_openers: Optional[int] = None #Defaults to None (unlimited) unless the AI sets a cap!
    allowed_shifts: List[ShiftTemplate] = Field(default_factory=list)

class ScheduleRequestPayload(BaseModel):
    week_start_date: str
    employees: List[Employee]
    daily_requirements: List[DailyRequirement]
    max_consecutive_openings: int = 2