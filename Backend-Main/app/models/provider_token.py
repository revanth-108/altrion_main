"""
Provider token model - stores provider credentials per user
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint, Boolean, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base
from app.core.encryption import EncryptedJSON
import uuid


class ProviderToken(Base):
    """Encrypted provider token storage"""
    __tablename__ = "provider_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id"),
        nullable=False,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)
    token_data = Column(EncryptedJSON, nullable=False)  # API keys/tokens — AES-256-GCM encrypted

    # Plaid Item ID — one row per bank connection per user.
    # Allows a user to connect multiple banks (each bank = one Plaid Item).
    # Nullable to preserve existing rows that predate this column.
    item_id = Column(String(255), nullable=True, index=True)

    # Soft-delete flag for provider tokens. Disconnects mark the row inactive
    # but keep the row so historical reconnections and audits remain intact.
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    # Plaid institution identifier. Used to detect duplicate connections to the
    # same institution and keep only the newest item active.
    institution_id = Column(String(50), nullable=True, index=True)

    # Plaid item metadata persisted from /item/get so sync logic can decide
    # whether an Item should be expected to support normal transactions.
    available_products = Column(JSONB, nullable=True)
    billed_products = Column(JSONB, nullable=True)
    update_type = Column(String(50), nullable=True)
    webhook = Column(String(500), nullable=True)
    consent_expiration_time = Column(DateTime(timezone=True), nullable=True)

    # Transaction sync readiness state. The webhook flips this on when Plaid
    # says updates are available; sync clears it after a successful fetch.
    transactions_update_available = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    transactions_update_available_at = Column(DateTime(timezone=True), nullable=True)
    last_transactions_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_transactions_sync_status = Column(String(50), nullable=True)

    # Transaction sync cursor for /transactions/sync endpoint.
    # Stores the next_cursor value returned by Plaid after each sync.
    # Pass this on the next sync call to get only new/changed transactions.
    # Null means this item has never been synced yet.
    cursor = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # FIX: Changed from (user_id, provider) to (user_id, provider, item_id)
        # to support multiple bank connections per user.
        # Each Plaid Item (bank) gets its own row.
        # NULL item_id values don't conflict in Postgres unique constraints,
        # so existing rows are preserved safely.
        UniqueConstraint("user_id", "provider", "item_id", name="uq_provider_tokens_user_provider_item"),
        {"schema": "public"},
    )
