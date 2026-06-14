"""
Investment transaction model - stores buy/sell/dividend history
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

class InvestmentTransaction(Base):
    """
    Stores investment transaction history from Plaid
    /investments/transactions/get endpoint.
    
    Covers buy, sell, dividend, fee, cash, and transfer activity.
    
    amount convention:
        Positive = cash outflow (you bought something)
        Negative = cash inflow (you sold or received dividend)
    """
    __tablename__ = "investment_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # References securities.security_id — not a FK to allow null
    # Some investment transactions have no security (e.g. cash transfers)
    security_id = Column(String(255), nullable=True, index=True)
    # Plaid's investment transaction identifier — unique per user
    investment_transaction_id = Column(String(255), nullable=False)
    date = Column(Date, nullable=False, index=True)
    # Description e.g. "BUY Apple Inc." or "DIVIDEND RECEIVED"
    name = Column(String(500), nullable=True)
    # Number of shares/units — negative for sells
    quantity = Column(Numeric(20, 8), nullable=True)
    # Total transaction value
    # Positive = cash outflow (buy), Negative = cash inflow (sell/dividend)
    amount = Column(Numeric(20, 8), nullable=True)
    # Price per share at time of transaction
    price = Column(Numeric(20, 8), nullable=True)
    # Transaction fees/commissions
    fees = Column(Numeric(20, 8), nullable=True)
    # buy, sell, dividend, cash, transfer, fee, other
    type = Column(String(50), nullable=True, index=True)
    # buy, sell, dividend, interest, deposit, withdrawal, etc.
    subtype = Column(String(50), nullable=True)
    currency = Column(String(10), default="USD", nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # Unique per user — not globally unique
        __import__('sqlalchemy').UniqueConstraint(
            "user_id", "investment_transaction_id",
            name="uq_investment_transactions_user_transaction"
        ),
        {"schema": "public"},
    )
