import os
from sqlmodel import SQLModel, create_engine, Session
from dotenv import load_dotenv

# 1. Load the hidden variables from your .env file
load_dotenv()

# 2. Grab the Neon URL
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is missing!")

# 3. Create the Postgres engine
engine = create_engine(DATABASE_URL, echo=True)

# 4. THE MISSING FUNCTION: This tells SQLModel to build the tables!
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

# 5. Dependency for your endpoints
def get_session():
    with Session(engine) as session:
        yield session