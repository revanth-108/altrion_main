"""
User model - references Supabase Auth users
"""
from sqlalchemy import Column, String, DateTime, Boolean, Date, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
from app.core.encryption import EncryptedString
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
    name = Column(EncryptedString)                  # PII — encrypted at rest
    nickname = Column(String(255))
    role = Column(String(50), default='user', nullable=False)
    # Profile fields for AFHS scoring
    date_of_birth = Column(Date, nullable=True)
    annual_income = Column(Numeric(15, 2), nullable=True)
    income_source = Column(EncryptedString, nullable=True)  # PII — encrypted at rest
    years_to_retirement = Column(Integer, nullable=True)
    wallet_address = Column(EncryptedString, nullable=True)  # PII — encrypted at rest
    data_storage_consent = Column(Boolean, nullable=False, default=False, server_default="false")
    data_storage_consent_at = Column(DateTime(timezone=True), nullable=True)
    data_storage_consent_version = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
