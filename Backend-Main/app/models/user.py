"""
User model - references Supabase Auth users
"""
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class User(Base):
    """
    User model - references Supabase Auth user
    Supabase Auth handles authentication, this table stores additional user data
    """
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supabase_user_id = Column(String(255), unique=True, nullable=False, index=True)  # Supabase Auth UUID
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255))
    nickname = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
