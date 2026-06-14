"""
Subscription Plan model
"""
from sqlalchemy import Column, String, DateTime, Boolean, Numeric, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class BillingCycleEnum(str, enum.Enum):
    """Billing cycle options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"
    QUARTERLY = "quarterly"
    LIFETIME = "lifetime"


billing_cycle_sql_enum = SQLEnum(
    BillingCycleEnum,
    name="billing_cycle",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class SubscriptionPlan(Base):
    """Subscription plans available to users"""
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    gateway = Column(String(50))
    gateway_plan_id = Column(String(255))
    gateway_product_id = Column(String(255))
    billing_cycle = Column(billing_cycle_sql_enum, nullable=False)
    base_price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="usd", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    features = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<SubscriptionPlan {self.name} ({self.billing_cycle})>"
