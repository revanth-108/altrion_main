"""
Global asset metadata cache — enriched via FMP Enterprise for equities,
CoinGecko for crypto, and internal fallbacks for cash/unknown instruments.
"""
from sqlalchemy import Boolean, Column, Numeric, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class AssetMetadata(Base):
    __tablename__ = "asset_metadata"

    # ── Identity ─────────────────────────────────────────────────────────────
    asset_key = Column(String(80), primary_key=True)
    canonical_symbol = Column(String(20), nullable=False, index=True)
    asset_class = Column(String(50), nullable=False, index=True)

    # ── Display ───────────────────────────────────────────────────────────────
    display_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)          # full company/fund description
    image_url = Column(String(500), nullable=True)     # logo/icon URL from FMP
    website = Column(String(500), nullable=True)       # company website

    # ── Classification ────────────────────────────────────────────────────────
    metadata_source = Column(String(50), nullable=False, default="internal")
    metadata_status = Column(String(50), nullable=False, default="pending", index=True)
    sector = Column(String(255), nullable=True)
    industry = Column(String(255), nullable=True)
    country = Column(String(100), nullable=True)
    exchange = Column(String(50), nullable=True)       # NYSE, NASDAQ, CRYPTO, etc.
    is_etf = Column(Boolean, nullable=False, default=False)
    is_fund = Column(Boolean, nullable=False, default=False)  # mutual fund

    # ── Identifiers ───────────────────────────────────────────────────────────
    cik = Column(String(50), nullable=True)
    isin = Column(String(50), nullable=True)
    coingecko_id = Column(String(100), nullable=True)
    fmp_symbol = Column(String(50), nullable=True)     # resolved FMP ticker (may differ from canonical)

    # ── FMP Fundamentals snapshot ─────────────────────────────────────────────
    market_cap = Column(Numeric(24, 2), nullable=True)
    beta = Column(Numeric(10, 4), nullable=True)
    vol_avg = Column(Numeric(20, 0), nullable=True)    # average daily volume

    # ── Raw & tags ────────────────────────────────────────────────────────────
    tags_json = Column(JSONB, nullable=True)
    raw_payload_json = Column(JSONB, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_refreshed_at = Column(DateTime(timezone=True), nullable=True)
    refresh_after = Column(DateTime(timezone=True), nullable=True, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        {"schema": "public"},
    )
