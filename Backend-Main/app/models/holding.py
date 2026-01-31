"""
Holding model - normalized asset holdings per account
This is the canonical truth layer for assets
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Holding(Base):
    """
    Normalized holding - one row per asset per account
    
    This is the ONLY truth layer for assets.
    All aggregation is computed from this table.
    """
    __tablename__ = "holdings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id"),
        nullable=False,
    )


    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.accounts.id"),
        nullable=False,
    )
    
    # Canonical asset identity (SYMBOL ONLY)
    canonical_symbol = Column(String(20), nullable=False, index=True)  # BTC, ETH, USDC
    
    # Asset classification
    asset_class = Column(String(50), nullable=False)  # 'crypto', 'cash_equivalent', 'equity'
    
    # Quantity with full precision
    quantity = Column(Numeric(36, 18), nullable=False)  # Full precision decimal
    
    # Source tracking
    source = Column(String(50), nullable=False)  # 'coinbase', 'plaid', 'wallet'
    
    # Timestamps
    retrieved_at = Column(DateTime(timezone=True), nullable=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Unique constraint: one holding per account per symbol
    __table_args__ = (
        Index("idx_holdings_account_symbol", "account_id", "canonical_symbol", unique=True),
        {"schema": "public"},
    )
