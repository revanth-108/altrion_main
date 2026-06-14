"""
Transaction model - stores Plaid transaction history
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Date, Numeric, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
from app.core.encryption import EncryptedString
import uuid


class Transaction(Base):
    """
    Stores transaction history from Plaid /transactions/sync endpoint.

    Unique per (user_id, transaction_id) — not globally unique because
    different Plaid environments could theoretically reuse IDs.

    amount convention:
        Positive = debit/outflow (you spent money)
        Negative = credit/inflow (you received money)
    """
    __tablename__ = "transactions"

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
    # Plaid's transaction identifier — unique per user
    transaction_id = Column(String(255), nullable=False)
    # Positive = debit/outflow, Negative = credit/inflow
    amount = Column(Numeric(20, 8), nullable=False)
    # Date transaction posted to account
    date = Column(Date, nullable=False, index=True)
    # Date transaction was authorized (may differ from posted date)
    authorized_date = Column(Date, nullable=True)
    # Raw bank description e.g. "UBER 072515 SF**POOL**" — PII, encrypted at rest
    name = Column(EncryptedString, nullable=True)
    # Cleaned merchant name e.g. "Uber" — PII, encrypted at rest
    merchant_name = Column(EncryptedString, nullable=True)
    # True if transaction has not yet posted
    pending = Column(Boolean, default=False, nullable=False)
    # online, in store, other
    payment_channel = Column(String(50), nullable=True)
    # Plaid enriched category e.g. TRANSPORTATION
    category_primary = Column(String(100), nullable=True, index=True)
    # e.g. TRANSPORTATION_TAXIS_AND_RIDE_SHARES
    category_detailed = Column(String(100), nullable=True)
    # VERY_HIGH, HIGH, MEDIUM, LOW, UNKNOWN
    category_confidence = Column(String(50), nullable=True)
    # Merchant logo URL from Plaid enrichment
    logo_url = Column(String(500), nullable=True)
    # Merchant website from Plaid enrichment
    website = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # Unique per user — not globally unique
        __import__('sqlalchemy').UniqueConstraint(
            "user_id", "transaction_id",
            name="uq_transactions_user_transaction"
        ),
        Index("idx_transactions_user_date", "user_id", "date"),
        Index("idx_transactions_account_date", "account_id", "date"),
        {"schema": "public"},
    )
