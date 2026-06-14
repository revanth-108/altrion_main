"""
Account model - represents a connected account from a provider
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Text, Numeric, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
from app.core.encryption import EncryptedString
import uuid


class Account(Base):
    """Account model - one account per provider connection"""
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id"),
        nullable=False,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)  # 'coinbase', 'plaid', 'wallet'
    provider_account_id = Column(String(255), nullable=False)  # External account ID
    name = Column(EncryptedString)              # PII — encrypted at rest
    account_type = Column(String(50))           # 'exchange', 'bank', 'brokerage', 'wallet'

    # Plaid account subtype — more specific than type.
    # Examples: checking, savings, credit card, 401k, ira, mortgage, student
    subtype = Column(String(50), nullable=True)

    # Last 4 digits of account number — safe to display in UI.
    # Never store full account numbers (Nacha compliance).
    mask = Column(EncryptedString, nullable=True)       # PII — encrypted at rest

    # Plaid institution identifier and name.
    # Stored here so we can display bank name/logo without an extra API call.
    institution_id = Column(String(50), nullable=True)
    institution_name = Column(EncryptedString, nullable=True)  # PII — encrypted at rest

    # Links this account back to the provider_tokens row it belongs to.
    # Allows us to find the correct access_token for a given account.
    item_id = Column(String(255), nullable=True, index=True)

    is_active = Column(Boolean, default=True, nullable=False)
    last_synced_at = Column(DateTime(timezone=True))
    error_message = Column(Text)  # Last error if sync failed

    # Balance snapshot — written by /accounts/sync, read by dashboard
    # Added by add_transactions_securities_tables migration
    balance_available = Column(Numeric(20, 8), nullable=True)   # Spendable (null for investment/loan)
    balance_current = Column(Numeric(20, 8), nullable=True)     # Posted balance or portfolio value
    balance_limit = Column(Numeric(20, 8), nullable=True)       # Credit limit (credit cards only)
    balance_currency = Column(String(10), default="USD", nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Canonical Plaid identity:
    #   user_id + provider + item_id + provider_account_id
    #
    # Historical inactive rows may share this identity, so only active Plaid
    # accounts are unique. Do not add a full-table UniqueConstraint here.
    __table_args__ = (
        Index(
            "uq_accounts_plaid_active_user_provider_item_account",
            "user_id",
            "provider",
            "item_id",
            "provider_account_id",
            unique=True,
            postgresql_where=text(
                "provider = 'plaid' AND is_active = TRUE AND item_id IS NOT NULL"
            ),
        ),
        {"schema": "public"},
    )
