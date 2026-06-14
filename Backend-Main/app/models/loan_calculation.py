"""
Loan calculation analytics model.
Stores aggregate metrics for each loan calculation request.
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.database import Base
from app.core.encryption import EncryptedString


class LoanCalculation(Base):
    __tablename__ = "loan_calculations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True, index=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    months = Column(Integer, nullable=False)
    payout_currency = Column(String(16), nullable=True)
    payout_method = Column(String(64), nullable=True)
    bank = Column(String(128), nullable=True)
    payment_status = Column(String(32), nullable=False, default="pending", server_default="pending")
    assets_count = Column(Integer, nullable=False)

    total_collateral_usd = Column(Numeric(20, 8), nullable=False)
    total_loan_usd = Column(Numeric(20, 8), nullable=False)
    portfolio_ltv_pct = Column(Numeric(8, 4), nullable=False)
    interest_rate_pct = Column(Numeric(8, 4), nullable=False)
    monthly_emi_usd = Column(Numeric(20, 8), nullable=False)
    margin_call_ltv_pct = Column(Numeric(8, 4), nullable=False)
    liquidation_ltv_pct = Column(Numeric(8, 4), nullable=False)

    analyst_provider = Column(String(64), nullable=True)
    analyst_model = Column(String(128), nullable=True)

    client_ip = Column(EncryptedString, nullable=True)    # PII — encrypted at rest
    user_agent = Column(EncryptedString, nullable=True)   # PII — encrypted at rest
    request_id = Column(String(128), nullable=True, index=True)
    metadata_json = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_loan_calculations_requested_at", "requested_at"),
        Index("idx_loan_calculations_user_id", "user_id"),
        Index("idx_loan_calculations_months", "months"),
        Index("idx_loan_calculations_payout_currency", "payout_currency"),
        Index("idx_loan_calculations_payout_method", "payout_method"),
        Index("idx_loan_calculations_bank", "bank"),
        Index("idx_loan_calculations_payment_status", "payment_status"),
        Index("idx_loan_calculations_total_loan", "total_loan_usd"),
        {"schema": "public"},
    )
