"""
Subscription model
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid
import enum


class SubscriptionStatusEnum(str, enum.Enum):
    """Subscription status options"""
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    UNPAID = "unpaid"
    INCOMPLETE = "incomplete"
    PAUSED = "paused"
    LIFETIME = "lifetime"


subscription_status_sql_enum = SQLEnum(
    SubscriptionStatusEnum,
    name="subscription_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class Subscription(Base):
    """User subscriptions"""
    __tablename__ = "subscriptions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Must use fully-qualified "public.users.id" because User model
    # specifies schema="public" in __table_args__
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, unique=True)
    # FIX: Must use fully-qualified "public.subscription_plans.id" because SubscriptionPlan model
    # specifies schema="public" in __table_args__
    plan_id = Column(UUID(as_uuid=True), ForeignKey("public.subscription_plans.id", ondelete="SET NULL"))
    gateway_subscription_id = Column(String(255), unique=True)
    gateway_customer_id = Column(String(255))
    gateway_payment_profile_id = Column(String(255))
    gateway_checkout_session_id = Column(String(255))
    gateway_last_event_id = Column(String(255))
    status = Column(subscription_status_sql_enum, nullable=False, default=SubscriptionStatusEnum.TRIALING)
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    trial_start = Column(DateTime(timezone=True))
    trial_end = Column(DateTime(timezone=True))
    cancel_at_period_end = Column(Boolean, default=False, nullable=False)
    canceled_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship — required for selectinload(Subscription.plan) in subscription_service.py
    # lazy="raise" prevents accidental implicit lazy loads in async context
    plan = relationship("SubscriptionPlan", lazy="raise", foreign_keys=[plan_id])

    __table_args__ = (
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<Subscription user_id={self.user_id} status={self.status}>"
    
    def is_active(self) -> bool:
        """Check if subscription provides active access (respects period_end for non-lifetime)."""
        from datetime import datetime, timezone
        if self.status == SubscriptionStatusEnum.LIFETIME:
            return True
        if self.status in (SubscriptionStatusEnum.TRIALING, SubscriptionStatusEnum.ACTIVE):
            # If the period has passed and it's scheduled to cancel, treat as inactive
            if self.current_period_end and self.current_period_end < datetime.now(timezone.utc):
                return False
            return True
        return False
