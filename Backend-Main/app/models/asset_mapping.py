"""
Asset symbol mapping - maps provider symbols to canonical symbols
Manual mapping table (no heuristic guessing)
"""
from sqlalchemy import Column, String, DateTime, Boolean, Index
from sqlalchemy.sql import func
from app.core.database import Base


class AssetMapping(Base):
    """Maps provider-specific symbols to canonical symbols"""
    __tablename__ = "asset_mappings"
    
    id = Column(String(50), primary_key=True)  # Composite: provider_symbol_provider
    provider = Column(String(50), nullable=False, index=True)  # 'coinbase', 'plaid', etc.
    provider_symbol = Column(String(100), nullable=False)  # Symbol as provider uses it
    canonical_symbol = Column(String(20), nullable=False, index=True)  # BTC, ETH, USDC
    asset_class = Column(String(50), nullable=False)  # 'crypto', 'cash_equivalent', 'equity'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        Index("idx_asset_mapping_provider_symbol", "provider", "provider_symbol", unique=True),
        {"schema": "public"},
    )
