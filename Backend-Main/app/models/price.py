"""
Price model - USD prices from CoinMarketCap
One price per canonical symbol
"""
from sqlalchemy import Column, String, DateTime, Numeric, Index
from sqlalchemy.sql import func
from app.core.database import Base


class Price(Base):
    """USD price per canonical symbol"""
    __tablename__ = "prices"
    
    id = Column(String(20), primary_key=True)  # canonical_symbol
    canonical_symbol = Column(String(20), nullable=False, unique=True, index=True)
    usd_price = Column(Numeric(36, 18), nullable=False)
    source = Column(String(50), default="coinmarketcap", nullable=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (
        {"schema": "public"},
    )
