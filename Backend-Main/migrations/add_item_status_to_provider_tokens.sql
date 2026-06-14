-- ============================================================
-- Migration: add_item_status_to_provider_tokens
-- Purpose: Persist Plaid /item/get response fields onto the
--          existing provider_tokens row for each Item.
-- Safe: additive only — ALTER TABLE ADD COLUMN IF NOT EXISTS,
--       no existing columns touched, no data modified.
-- ============================================================

-- Institution ID returned by Plaid for the connected bank
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS institution_id VARCHAR(50);

-- Products currently available to call on this Item
-- Stored as JSONB array e.g. ["transactions", "investments"]
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS available_products JSONB;

-- Products that have been billed / used at least once on this Item
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS billed_products JSONB;

-- When the user's consent for this Item expires (null = no expiry)
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS consent_expiration_time TIMESTAMPTZ;

-- How the Item is updated: 'automated' or 'webhook'
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS update_type VARCHAR(50);

-- Webhook URL configured for this Item (if any)
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS webhook TEXT;

-- Error state — populated when item.error is non-null (e.g. ITEM_LOGIN_REQUIRED)
-- All three are cleared to NULL when the Item has no error
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS item_error_type VARCHAR(100);

ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS item_error_code VARCHAR(100);

ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS item_error_message TEXT;

-- Timestamp of the last successful /item/get sync
ALTER TABLE public.provider_tokens
    ADD COLUMN IF NOT EXISTS item_status_last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- Index on institution_id for potential future lookups by institution
CREATE INDEX IF NOT EXISTS idx_provider_tokens_institution_id
    ON public.provider_tokens (institution_id);
