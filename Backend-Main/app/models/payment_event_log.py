"""
Payment event log model for webhook idempotency and auditability.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class PaymentEventLog(Base):
    """Tracks gateway webhook events that have been received and processed."""

    __tablename__ = "payment_event_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String(255), nullable=False, unique=True)
    gateway = Column(String(50), nullable=False)
    event_type = Column(String(100), nullable=False)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("public.subscriptions.id", ondelete="SET NULL"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="SET NULL"))
    payload = Column(JSONB)
    processed = Column(Boolean, default=False, nullable=False)
    processed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        {"schema": "public"},
    )

    def __repr__(self):
        return f"<PaymentEventLog event_id={self.event_id} gateway={self.gateway} processed={self.processed}>"
