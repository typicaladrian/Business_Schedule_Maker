from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

# 1. MANAGER TABLE (Linked to their future Clerk Auth ID)
class Manager(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    clerk_id: str = Field(unique=True, index=True) # This will store their secure login ID
    
    # A manager can own multiple branches
    branches: List["Branch"] = Relationship(back_populates="manager")

# 2. BRANCH TABLE
class Branch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    
    # Foreign Key linking to the Manager
    manager_id: Optional[int] = Field(default=None, foreign_key="manager.id")
    manager: Optional[Manager] = Relationship(back_populates="branches")
    
    # A branch has many employees
    employees: List["EmployeeDB"] = Relationship(back_populates="branch")

# 3. EMPLOYEE TABLE
class EmployeeDB(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    is_full_time: bool = Field(default=False)
    min_hours: int = Field(default=0)
    max_hours: int = Field(default=40)
    
    # We will store skills and unavailable days as comma-separated strings for now to keep it lightweight
    skills: str = Field(default="")
    unavailable_days: str = Field(default="") 
    
    # Foreign Key linking to the Branch
    branch_id: Optional[int] = Field(default=None, foreign_key="branch.id")
    branch: Optional[Branch] = Relationship(back_populates="employees")