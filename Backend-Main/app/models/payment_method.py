"""
Payment Method model
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class PaymentMethod(Base):
    """User payment methods stored with the configured billing gateway."""
    __tablename__ = "payment_methods"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Must use fully-qualified "public.users.id" because User model
    # specifies schema="public" in __table_args__
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False)
    gateway_payment_method_id = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    last4 = Column(String(4))
    brand = Column(String(50))
    exp_month = Column(Integer)
    exp_year = Column(Integer)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        UniqueConstraint("user_id", "gateway_payment_method_id", name="uq_payment_methods_user_gateway_pm"),
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<PaymentMethod user_id={self.user_id} type={self.type} last4={self.last4}>"
