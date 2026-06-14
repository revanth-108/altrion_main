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


async def _collapse_duplicate_plaid_accounts(conn) -> None:
    """Collapse preexisting duplicate active Plaid accounts without deleting rows."""
    result = await conn.execute(
        text(
            """
            SELECT
                id,
                user_id::text AS user_id,
                provider,
                item_id,
                provider_account_id,
                row_number() OVER (
                    PARTITION BY user_id, provider, item_id, provider_account_id
                    ORDER BY
                        (balance_current IS NOT NULL) DESC,
                        (balance_available IS NOT NULL) DESC,
                        (balance_limit IS NOT NULL) DESC,
                        (last_synced_at IS NOT NULL) DESC,
                        (institution_id IS NOT NULL) DESC,
                        (error_message IS NULL) DESC,
                        is_active DESC,
                        updated_at DESC NULLS LAST,
                        created_at DESC NULLS LAST,
                        id DESC
                ) AS rn
            FROM public.accounts
            WHERE provider = 'plaid'
            ORDER BY user_id, provider, item_id, provider_account_id, rn
            """
        )
    )
    rows = result.mappings().all()
    if not rows:
        return

    keeper_by_key: dict[tuple[str, str | None, str], dict] = {}
    duplicate_groups: dict[tuple[str, str | None, str], list[dict]] = {}
    for row in rows:
        key = (row["user_id"], row["item_id"], row["provider_account_id"])
        if row["rn"] == 1:
            keeper_by_key[key] = row
            continue
        duplicate_groups.setdefault(key, []).append(row)

    if not duplicate_groups:
        return

    total_duplicate_rows = 0
    total_child_rows = 0
    liabilities_exists = bool(
        (
            await conn.execute(text("SELECT to_regclass('public.liabilities') IS NOT NULL"))
        ).scalar_one()
    )

    for key, rows_for_group in duplicate_groups.items():
        keeper = keeper_by_key.get(key)
        if keeper is None:
            continue

        duplicate_ids = [str(row["id"]) for row in rows_for_group]
        total_duplicate_rows += len(duplicate_ids)

        params = {
            "keeper_id": str(keeper["id"]),
            "duplicate_ids": duplicate_ids,
        }
        for table_name in ("transactions", "investment_transactions", "holdings", "recurring_streams"):
            update_res = await conn.execute(
                text(
                    f"""
                    UPDATE public.{table_name}
                    SET account_id = :keeper_id
                    WHERE account_id = ANY(CAST(:duplicate_ids AS uuid[]))
                    """
                ),
                params,
            )
            total_child_rows += int(update_res.rowcount or 0)

        if liabilities_exists:
            update_res = await conn.execute(
                text(
                    """
                    UPDATE public.liabilities
                    SET account_id = :keeper_id
                    WHERE account_id = ANY(CAST(:duplicate_ids AS uuid[]))
                    """
                ),
                params,
            )
            total_child_rows += int(update_res.rowcount or 0)

        await conn.execute(
            text(
                """
                UPDATE public.accounts
                SET is_active = FALSE,
                    error_message = 'Duplicate Plaid account collapsed during startup migration',
                    updated_at = NOW()
                WHERE id = ANY(CAST(:duplicate_ids AS uuid[]))
                """
            ),
            {"duplicate_ids": duplicate_ids},
        )
        await conn.execute(
            text(
                """
                UPDATE public.accounts
                SET is_active = TRUE,
                    error_message = NULL,
                    updated_at = NOW()
                WHERE id = :keeper_id
                """
            ),
            {"keeper_id": str(keeper["id"])},
        )

    logger.warning(
        "plaid_account_duplicates_collapsed_during_migration",
        duplicate_groups=len(duplicate_groups),
        duplicate_rows=total_duplicate_rows,
        moved_child_rows=total_child_rows,
    )

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

    # Worth It rolling sessions — allow multiple batches per user over time.
    "ALTER TABLE public.worth_it_sessions DROP CONSTRAINT IF EXISTS uq_worth_it_sessions_user_week",

    # Worth It canonical review-once guard — clean up duplicates before adding uniqueness.
    """
    WITH ranked AS (
        SELECT
            ctid,
            row_number() OVER (
                PARTITION BY user_id, transaction_ref_id
                ORDER BY updated_at DESC, created_at DESC, rated_at DESC, id DESC
            ) AS rn
        FROM public.worth_it_ratings
    )
    DELETE FROM public.worth_it_ratings
    WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
    """,
    """
    WITH ranked AS (
        SELECT
            ctid,
            row_number() OVER (
                PARTITION BY user_id, transaction_ref_id
                ORDER BY created_at DESC, position ASC, id DESC
            ) AS rn
        FROM public.worth_it_session_transactions
    )
    DELETE FROM public.worth_it_session_transactions
    WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
    """,
    """
    WITH ranked AS (
        SELECT
            ctid,
            row_number() OVER (
                PARTITION BY user_id, provider, item_id
                ORDER BY is_active DESC, updated_at DESC NULLS LAST,
                         created_at DESC NULLS LAST, id DESC
            ) AS rn
        FROM public.provider_tokens
        WHERE item_id IS NOT NULL
    )
    DELETE FROM public.provider_tokens
    WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_provider_tokens_user_provider_item'
              AND conrelid = 'public.provider_tokens'::regclass
        ) THEN
            ALTER TABLE public.provider_tokens
            ADD CONSTRAINT uq_provider_tokens_user_provider_item
            UNIQUE (user_id, provider, item_id);
        END IF;
    END
    $$
    """,
    """
    ALTER TABLE public.accounts
    DROP CONSTRAINT IF EXISTS uq_accounts_user_provider_item_provider_account
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_plaid_active_user_provider_item_account
    ON public.accounts (user_id, provider, item_id, provider_account_id)
    WHERE provider = 'plaid'
      AND is_active = TRUE
      AND item_id IS NOT NULL
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_worth_it_ratings_user_tx ON public.worth_it_ratings(user_id, transaction_ref_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_worth_it_session_transactions_user_tx ON public.worth_it_session_transactions(user_id, transaction_ref_id)",
]


async def run_migrations(engine: AsyncEngine) -> None:
    """Execute all pending DDL migrations. Called once on startup."""
    async with engine.begin() as conn:
        await _collapse_duplicate_plaid_accounts(conn)
        for stmt in _MIGRATIONS:
            try:
                # A failed PostgreSQL statement aborts its transaction. Isolate
                # every migration in a savepoint so one optional/racing DDL
                # failure cannot prevent later schema protections from running.
                async with conn.begin_nested():
                    await conn.execute(text(stmt.strip()))
            except Exception as exc:
                # Log but don't abort startup; concurrent app instances may race
                # while creating the same idempotent index or constraint.
                logger.warning("migration_stmt_failed", error=str(exc), stmt=stmt[:80])
    logger.info("startup_migrations_complete", count=len(_MIGRATIONS))
