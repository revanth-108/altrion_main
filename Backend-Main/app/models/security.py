"""
Security model - global reference table for investment securities
"""
from sqlalchemy import Column, String, DateTime, Boolean, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

class Security(Base):
    """
    Global reference table for Plaid securities.
    
    Plaid's security_id is stable and global — the same security
    (e.g. AAPL) has the same security_id for every user who holds it.
    No user_id — this table is shared across all users.
    
    securities are upserted on every investment sync so close_price
    stays current.
    """
    __tablename__ = "securities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Plaid's stable global security identifier
    security_id = Column(String(255), nullable=False, unique=True, index=True)
    # Full security name e.g. "Apple Inc."
    name = Column(String(255), nullable=True)
    # Exchange ticker e.g. AAPL, BTC — may be null for some securities
    ticker_symbol = Column(String(50), nullable=True, index=True)
    # equity, etf, mutual fund, cryptocurrency, cash, derivative, other
    type = Column(String(50), nullable=True, index=True)
    # True for money market funds, USD, stablecoins
    is_cash_equivalent = Column(Boolean, default=False, nullable=False)
    # Most recent closing price from Plaid
    close_price = Column(Numeric(20, 8), nullable=True)
    currency = Column(String(10), default="USD", nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        {"schema": "public"},
    )
