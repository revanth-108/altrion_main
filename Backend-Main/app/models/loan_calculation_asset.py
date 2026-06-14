"""
Per-asset analytics rows for each loan calculation.
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class LoanCalculationAsset(Base):
    __tablename__ = "loan_calculation_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_calculation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.loan_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    symbol = Column(String(32), nullable=False, index=True)
    tier = Column(String(32), nullable=False)
    asset_order = Column(Integer, nullable=False, default=0)

    collateral_usd = Column(Numeric(20, 8), nullable=False)
    loan_usd = Column(Numeric(20, 8), nullable=False)
    ltv_frac = Column(Numeric(10, 8), nullable=False)
    interest_rate_frac = Column(Numeric(10, 8), nullable=False)
    base_rate_frac = Column(Numeric(10, 8), nullable=True)
    risk_premium_frac = Column(Numeric(10, 8), nullable=True)
    volatility_premium_frac = Column(Numeric(10, 8), nullable=True)
    pct_change_30d = Column(Numeric(12, 6), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_loan_calc_assets_calc_symbol", "loan_calculation_id", "symbol"),
        Index("idx_loan_calc_assets_symbol_tier", "symbol", "tier"),
        {"schema": "public"},
    )

