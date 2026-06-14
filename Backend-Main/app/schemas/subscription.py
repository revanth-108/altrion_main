"""
Pydantic schemas for subscription-related data
"""
from pydantic import BaseModel, Field, field_validator, validator  # noqa: F401 validator used by PromoCode/Discount validators below
from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID


class BillingCycle(str, Enum):
    """Billing cycle options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"
    QUARTERLY = "quarterly"
    LIFETIME = "lifetime"


class SubscriptionStatus(str, Enum):
    """Subscription status options"""
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    UNPAID = "unpaid"
    INCOMPLETE = "incomplete"
    PAUSED = "paused"
    LIFETIME = "lifetime"


class DiscountType(str, Enum):
    """Discount type options"""
    PERCENTAGE = "percentage"
    FIXED = "fixed"


# Subscription Plan Schemas
class SubscriptionPlanBase(BaseModel):
    """Base subscription plan schema"""
    name: str
    billing_cycle: BillingCycle
    base_price: Decimal
    currency: str = "usd"
    features: Dict[str, Any] = {}


class SubscriptionPlanCreate(SubscriptionPlanBase):
    """Create subscription plan schema"""
    gateway: Optional[str] = None
    gateway_plan_id: Optional[str] = None
    gateway_product_id: Optional[str] = None
    is_active: bool = True


class SubscriptionPlanResponse(SubscriptionPlanBase):
    """Subscription plan response schema"""
    id: UUID
    gateway: Optional[str] = None
    gateway_plan_id: Optional[str] = None
    gateway_product_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Subscription Schemas
class SubscriptionBase(BaseModel):
    """Base subscription schema"""
    status: SubscriptionStatus
    current_period_start: datetime
    current_period_end: datetime


class SubscriptionCreate(BaseModel):
    """Create subscription schema"""
    user_id: str
    plan_id: Optional[str] = None
    trial_days: int = 14


class SubscriptionResponse(SubscriptionBase):
    """Subscription response schema"""
    id: str
    user_id: str
    plan_id: Optional[str]
    gateway_subscription_id: Optional[str] = None
    gateway_customer_id: Optional[str] = None
    gateway_payment_profile_id: Optional[str] = None
    gateway_checkout_session_id: Optional[str] = None
    trial_start: Optional[datetime]
    trial_end: Optional[datetime]
    cancel_at_period_end: bool
    canceled_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    # Include plan details if available
    plan: Optional[SubscriptionPlanResponse] = None

    # Computed fields — set manually after from_orm, not auto-populated
    is_active: bool = False
    days_until_renewal: Optional[int] = None

    @field_validator('id', 'user_id', 'plan_id', mode='before')
    @classmethod
    def coerce_uuid_to_str(cls, v):
        if v is None:
            return v
        return str(v)

    @field_validator('is_active', mode='before')
    @classmethod
    def coerce_is_active(cls, v):
        if callable(v):
            return False
        return bool(v) if v is not None else False

    class Config:
        from_attributes = True


class SubscriptionWithOverride(SubscriptionResponse):
    """Subscription with override information"""
    override: Optional["SubscriptionOverrideResponse"] = None
    effective_price: Optional[Decimal] = None


# Subscription Override Schemas
class SubscriptionOverrideCreate(BaseModel):
    """Create subscription override schema"""
    user_id: str
    override_price: Optional[Decimal] = None
    discount_percentage: Optional[Decimal] = None
    discount_fixed: Optional[Decimal] = None
    is_waived: bool = False
    waive_reason: Optional[str] = None
    override_reason: Optional[str] = None
    created_by: str


class SubscriptionOverrideResponse(BaseModel):
    """Subscription override response schema"""
    id: str
    user_id: str
    override_price: Optional[Decimal]
    discount_percentage: Optional[Decimal]
    discount_fixed: Optional[Decimal]
    is_waived: bool
    waive_reason: Optional[str]
    override_reason: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime

    @field_validator('id', 'user_id', mode='before')
    @classmethod
    def coerce_uuid_to_str(cls, v):
        if v is None:
            return v
        return str(v)

    class Config:
        from_attributes = True


# Promo Code Schemas
class PromoCodeCreate(BaseModel):
    """Create promo code schema"""
    code: str = Field(..., min_length=3, max_length=50)
    discount_type: DiscountType
    discount_value: Decimal = Field(..., gt=0)
    max_redemptions: Optional[int] = Field(None, gt=0)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    applies_to_plan_ids: Optional[List[str]] = None
    
    @validator('discount_value')
    def validate_discount_value(cls, v, values):
        """Validate discount value based on type"""
        if 'discount_type' in values:
            if values['discount_type'] == DiscountType.PERCENTAGE:
                if v > 100:
                    raise ValueError('Percentage discount cannot exceed 100')
        return v


class PromoCodeResponse(BaseModel):
    """Promo code response schema"""
    id: str
    code: str
    gateway_coupon_id: Optional[str] = None
    discount_type: DiscountType
    discount_value: Decimal
    max_redemptions: Optional[int]
    redemptions_count: int
    valid_from: datetime
    valid_until: Optional[datetime]
    is_active: bool
    applies_to_plan_ids: Optional[List[str]]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Checkout Schemas
class CheckoutSessionCreate(BaseModel):
    """Create checkout session schema"""
    plan_id: str
    promo_code: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    """Checkout session response schema"""
    session_id: str
    url: str
    publishable_key: Optional[str] = None
    method: str = "GET"
    fields: Optional[Dict[str, str]] = None


# Subscription Actions
class CancelSubscriptionRequest(BaseModel):
    """Cancel subscription request"""
    immediately: bool = False
    reason: Optional[str] = None


# Analytics Schemas
class SubscriptionAnalytics(BaseModel):
    """Subscription analytics response"""
    total_subscribers: int
    active_subscribers: int
    trialing_subscribers: int
    canceled_subscribers: int
    monthly_recurring_revenue: Decimal
    annual_recurring_revenue: Decimal
    churn_rate: float
    average_revenue_per_user: Decimal
    lifetime_value: Decimal
    trial_conversion_rate: float


class SubscriptionListFilters(BaseModel):
    """Filters for subscription list"""
    status: Optional[SubscriptionStatus] = None
    plan_id: Optional[str] = None
    has_override: Optional[bool] = None
    is_waived: Optional[bool] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


# Apply Promo Code
class ApplyPromoCodeRequest(BaseModel):
    """Apply promo code request"""
    code: str


# Resolve forward refs used by response models at import time.
SubscriptionWithOverride.model_rebuild()
