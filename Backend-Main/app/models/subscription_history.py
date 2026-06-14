"""
Subscription History model for audit logging
"""
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class SubscriptionHistory(Base):
    """Audit log of subscription changes"""
    __tablename__ = "subscription_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Must use fully-qualified "public.subscriptions.id" because Subscription model
    # specifies schema="public" in __table_args__
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("public.subscriptions.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)
    previous_state = Column(JSONB)
    new_state = Column(JSONB)
    performed_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<SubscriptionHistory subscription_id={self.subscription_id} action={self.action}>"
