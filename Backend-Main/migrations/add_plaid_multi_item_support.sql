-- ============================================================
-- Migration: add_plaid_multi_item_support
-- Purpose: Support multiple Plaid bank connections per user,
--          transaction sync cursors, and richer account metadata
-- Safe: additive only — no columns dropped, no data modified
-- ============================================================

-- provider_tokens: add item_id for multi-bank support
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS item_id VARCHAR(255);

-- provider_tokens: add cursor for /transactions/sync pagination
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS cursor VARCHAR(500);

-- provider_tokens: add index on item_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_provider_tokens_item_id
    ON public.provider_tokens(item_id);

-- provider_tokens: drop old single-bank unique constraint
ALTER TABLE public.provider_tokens
    DROP CONSTRAINT IF EXISTS uq_provider_tokens_user_provider;

-- provider_tokens: add new multi-bank unique constraint
-- NULL item_id values do not conflict in Postgres unique constraints
ALTER TABLE public.provider_tokens
    ADD CONSTRAINT uq_provider_tokens_user_provider_item
    UNIQUE (user_id, provider, item_id);

-- accounts: add Plaid-specific metadata columns
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS subtype VARCHAR(50);

ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS mask VARCHAR(10);

ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS institution_id VARCHAR(50);

ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS institution_name VARCHAR(255);

-- accounts: add item_id to link account back to its provider_token row
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS item_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_accounts_item_id
    ON public.accounts(item_id);

-- holdings: add investment-specific columns
ALTER TABLE public.holdings
    ADD COLUMN IF NOT EXISTS cost_basis NUMERIC(20, 8);

ALTER TABLE public.holdings
    ADD COLUMN IF NOT EXISTS security_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_holdings_security_id
    ON public.holdings(security_id);
