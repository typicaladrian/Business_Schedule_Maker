import os
from sqlmodel import SQLModel, create_engine, Session
from backend.app.schema import Manager, Branch, EmployeeDB

# Create a local SQLite database file named 'app.db'
sqlite_file_name = "app.db"
sqlite_url = f"sqlite:///{os.path.join(os.path.dirname(__file__), sqlite_file_name)}"

# The Engine is the core connection point to the database
engine = create_engine(sqlite_url, echo=True)

def create_db_and_tables():
    """Tells SQLModel to inspect our schema and build the actual SQL tables."""
    SQLModel.metadata.create_all(engine)

def get_session():
    """A helper function we will use in FastAPI endpoints to talk to the DB."""
    with Session(engine) as session:
        yield session