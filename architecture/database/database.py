# database/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Conceptually pointing to a local SQLite DB
DATABASE_URL = os.getenv('DATABASE_URI', 'sqlite:///stegavault.db')

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Provides a database session for requests"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
