"""
Promo Code model
"""
from sqlalchemy import Column, String, DateTime, Boolean, Integer, Numeric, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class DiscountTypeEnum(str, enum.Enum):
    """Discount type options"""
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class PromoCode(Base):
    """Promotional codes for discounts"""
    __tablename__ = "promo_codes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(100), nullable=False, unique=True)
    gateway_coupon_id = Column(String(255))
    discount_type = Column(SQLEnum(DiscountTypeEnum, name="discount_type"), nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)
    max_redemptions = Column(Integer)
    redemptions_count = Column(Integer, default=0, nullable=False)
    valid_from = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    valid_until = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True, nullable=False)
    applies_to_plan_ids = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
    
    def __repr__(self):
        return f"<PromoCode {self.code} ({self.discount_type}: {self.discount_value})>"
    
    def is_valid(self) -> bool:
        """Check if promo code is currently valid"""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        
        # Check if active
        if not self.is_active:
            return False
        
        # Check if within valid date range
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_until and now > self.valid_until:
            return False
        
        # Check redemption limit
        if self.max_redemptions and self.redemptions_count >= self.max_redemptions:
            return False
        
        return True
