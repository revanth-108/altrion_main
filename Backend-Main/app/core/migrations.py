"""
Lightweight schema migration helper (no Alembic).
Each statement is idempotent — safe to run on every startup.
Add new entries at the bottom; never remove old ones.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.logging import get_logger

logger = get_logger()

# ── DDL statements ────────────────────────────────────────────────────────────
# Rules:
#  • Always use ADD COLUMN IF NOT EXISTS
#  • Always fully-qualify schema: public.<table>
#  • Append new migrations at the end
_MIGRATIONS: list[str] = [
    # asset_metadata — FMP enrichment columns (2024-Q4)
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS website VARCHAR(500)",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS exchange VARCHAR(50)",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS is_etf BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS is_fund BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS market_cap NUMERIC(24,2)",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS beta NUMERIC(10,4)",
    "ALTER TABLE public.asset_metadata ADD COLUMN IF NOT EXISTS vol_avg NUMERIC(20,0)",

    # etf_constituents — real ETF look-through cache (2025-Q2)
    """
    CREATE TABLE IF NOT EXISTS public.etf_constituents (
        etf_symbol          VARCHAR(20)     NOT NULL,
        constituent_symbol  VARCHAR(20)     NOT NULL,
        constituent_name    VARCHAR(255),
        weight_pct          NUMERIC(10, 4),
        shares              BIGINT,
        fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        refresh_after       TIMESTAMPTZ,
        updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        PRIMARY KEY (etf_symbol, constituent_symbol)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_etf_constituents_refresh    ON public.etf_constituents(refresh_after)",
    "CREATE INDEX IF NOT EXISTS idx_etf_constituents_constituent ON public.etf_constituents(constituent_symbol)",

    # Reset stale rows that never got proper FMP data so they re-enrich on next access
    """
    UPDATE public.asset_metadata
    SET refresh_after = NOW() - INTERVAL '1 second'
    WHERE metadata_status IN ('missing', 'partial')
      AND (sector IS NULL OR sector = 'Unknown')
    """,

    # provider_tokens — soft-delete support for Plaid disconnects
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS available_products JSONB",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS billed_products JSONB",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS update_type VARCHAR(50)",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS webhook VARCHAR(500)",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS consent_expiration_time TIMESTAMPTZ",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS transactions_update_available BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS transactions_update_available_at TIMESTAMPTZ",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS last_transactions_synced_at TIMESTAMPTZ",
    "ALTER TABLE public.provider_tokens ADD COLUMN IF NOT EXISTS last_transactions_sync_status VARCHAR(50)",
]


async def run_migrations(engine: AsyncEngine) -> None:
    """Execute all pending DDL migrations. Called once on startup."""
    async with engine.begin() as conn:
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt.strip()))
            except Exception as exc:
                # Log but don't abort startup — most failures are harmless race conditions
                logger.warning("migration_stmt_failed", error=str(exc), stmt=stmt[:80])
    logger.info("startup_migrations_complete", count=len(_MIGRATIONS))
