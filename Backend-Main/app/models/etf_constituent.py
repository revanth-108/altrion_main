"""
ETF constituent cache — stores top holdings of each ETF with their weights.
Data sourced from Yahoo Finance quoteSummary topHoldings, refreshed every 7 days.
Also stores sector_weights_json: the full ETF sector distribution from Yahoo
sectorWeightings (e.g. {"Technology": 35.7, "Financials": 11.6}).
"""
from sqlalchemy import Column, String, Numeric, DateTime, BigInteger
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class EtfConstituent(Base):
    __tablename__ = "etf_constituents"
    __table_args__ = ({"schema": "public"},)

    # ── Identity (composite PK) ───────────────────────────────────────────────
    etf_symbol = Column(String(20), primary_key=True)
    constituent_symbol = Column(String(20), primary_key=True)

    # ── Data ─────────────────────────────────────────────────────────────────
    constituent_name = Column(String(255), nullable=True)
    weight_pct = Column(Numeric(10, 4), nullable=True)   # % weight within the ETF (0–100)
    shares = Column(BigInteger, nullable=True)
    # Yahoo Finance sectorWeightings — same JSON on every row for the same ETF
    sector_weights_json = Column(JSONB, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    refresh_after = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
