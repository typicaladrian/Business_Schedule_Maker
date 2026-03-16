from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

# 1. MANAGER TABLE
class Manager(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    clerk_id: str = Field(unique=True, index=True)
    
    branches: List["Branch"] = Relationship(back_populates="manager")

# 2. BRANCH TABLE
class Branch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    
    min_daily_headcount: int = Field(default=5) 
    
    manager_id: Optional[int] = Field(default=None, foreign_key="manager.id")
    manager: Optional[Manager] = Relationship(back_populates="branches")
    
    employees: List["EmployeeDB"] = Relationship(back_populates="branch")
    
    # NEW: A branch can have many custom AI rules!
    custom_rules: List["CustomRule"] = Relationship(back_populates="branch")

# 3. EMPLOYEE TABLE
class EmployeeDB(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    is_full_time: bool = Field(default=False)
    min_hours: int = Field(default=0)
    max_hours: int = Field(default=40)
    skills: str = Field(default="")
    unavailable_days: str = Field(default="") 
    
    branch_id: Optional[int] = Field(default=None, foreign_key="branch.id")
    branch: Optional[Branch] = Relationship(back_populates="employees")

# 4. NEW: CUSTOM AI RULES TABLE
class CustomRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # What kind of rule is this? (e.g., "time_off", "require_specific_shift")
    rule_type: str 
    
    # What day does this apply to? (e.g., "Friday", "2026-03-20")
    target_date: str 
    
    # The plain English description the AI will write for your UI dashboard
    description: str 
    
    # If the rule targets a specific person, store their ID here
    employee_id: Optional[int] = Field(default=None, foreign_key="employeedb.id")
    
    # If the rule changes a number (like temporarily needing 6 people instead of 5)
    value: Optional[int] = Field(default=None)
    
    # Strict isolation: This rule ONLY applies to this specific branch
    branch_id: Optional[int] = Field(default=None, foreign_key="branch.id")
    branch: Optional[Branch] = Relationship(back_populates="custom_rules")