"""
Subscription Override model for custom pricing
"""
from sqlalchemy import CheckConstraint, Column, String, DateTime, Boolean, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class SubscriptionOverride(Base):
    """Custom pricing and discounts per user"""
    __tablename__ = "subscription_overrides"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Must use fully-qualified "public.users.id" because User model
    # specifies schema="public" in __table_args__
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, unique=True)
    override_price = Column(Numeric(10, 2))
    discount_percentage = Column(Numeric(5, 2))
    discount_fixed = Column(Numeric(10, 2))
    is_waived = Column(Boolean, default=False, nullable=False)
    waive_reason = Column(Text)
    override_reason = Column(Text)
    created_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        # At most one discount mechanism may be active at a time.
        # is_waived trumps all; otherwise only one of override_price, discount_percentage,
        # or discount_fixed should be set.
        CheckConstraint(
            "(is_waived = TRUE) OR "
            "(CASE WHEN override_price IS NOT NULL THEN 1 ELSE 0 END "
            "+ CASE WHEN discount_percentage IS NOT NULL THEN 1 ELSE 0 END "
            "+ CASE WHEN discount_fixed IS NOT NULL THEN 1 ELSE 0 END) <= 1",
            name="chk_subscription_overrides_single_discount",
        ),
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<SubscriptionOverride user_id={self.user_id} is_waived={self.is_waived}>"
