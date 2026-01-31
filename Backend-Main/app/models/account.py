"""
Account model - represents a connected account from a provider
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Account(Base):
    """Account model - one account per provider connection"""
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id"),
        nullable=False,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)  # 'coinbase', 'plaid', 'wallet'
    provider_account_id = Column(String(255), nullable=False)  # External account ID
    name = Column(String(255))  # Account name from provider
    account_type = Column(String(50))  # 'exchange', 'bank', 'brokerage', 'wallet'
    is_active = Column(Boolean, default=True, nullable=False)
    last_synced_at = Column(DateTime(timezone=True))
    error_message = Column(Text)  # Last error if sync failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Unique constraint: one account per provider_account_id per user
    __table_args__ = (
        {"schema": "public"},
    )
