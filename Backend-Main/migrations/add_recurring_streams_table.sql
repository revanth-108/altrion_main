-- ============================================================
-- Migration: add_recurring_streams_table
-- Purpose: Store Plaid recurring transaction stream data
--          from /transactions/recurring/get
-- Safe: additive only — no existing tables or columns modified
-- Multi-user safe: user-scoped with user_id FK + indexes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recurring_streams (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this stream
    user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Account this stream belongs to (nullable — SET NULL if account deleted)
    account_id           UUID REFERENCES public.accounts(id) ON DELETE SET NULL,

    -- Plaid account_id — for mapping to internal account_id
    provider_account_id  VARCHAR(255) NOT NULL,

    -- Plaid's stable stream identifier — used as upsert key with user_id
    stream_id            VARCHAR(255) NOT NULL,

    -- 'inflow' or 'outflow'
    stream_type          VARCHAR(10) NOT NULL,

    -- Stream description e.g. 'Netflix', 'Salary'
    description          TEXT,

    merchant_name        VARCHAR(255),

    -- e.g. WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, UNKNOWN
    frequency            VARCHAR(30),

    -- Average dollar amount per occurrence (negative = inflow/income)
    average_amount       NUMERIC(20, 8),

    -- Most recent occurrence amount
    last_amount          NUMERIC(20, 8),

    -- Earliest known occurrence date
    first_date           DATE,

    -- Most recent occurrence date
    last_date            DATE,

    -- Plaid's predicted next occurrence date
    predicted_next_date  DATE,

    -- MATURE | EARLY_DETECTION | TOMBSTONED
    status               VARCHAR(30),

    is_active            BOOLEAN DEFAULT TRUE,

    last_synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --------------------------------------------------------
-- Unique constraint — upsert key
-- stream_id is globally stable per Plaid item, unique per user
-- --------------------------------------------------------
ALTER TABLE public.recurring_streams
    ADD CONSTRAINT uq_recurring_streams_user_stream
    UNIQUE (user_id, stream_id);


-- --------------------------------------------------------
-- Indexes for common query patterns
-- --------------------------------------------------------

-- Most common: fetch all streams for a user
CREATE INDEX IF NOT EXISTS idx_recurring_streams_user_id
    ON public.recurring_streams (user_id);

-- Fetch streams for a specific account
CREATE INDEX IF NOT EXISTS idx_recurring_streams_account_id
    ON public.recurring_streams (account_id);

-- Filter inflow vs outflow for a user
CREATE INDEX IF NOT EXISTS idx_recurring_streams_user_type
    ON public.recurring_streams (user_id, stream_type);
