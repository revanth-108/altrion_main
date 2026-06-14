-- ============================================================
-- Migration: add_identity_to_accounts
-- Purpose: Store Plaid /identity/get response (owners array)
--          directly on the accounts row for each account.
-- Safe: additive only — ADD COLUMN IF NOT EXISTS,
--       no existing columns touched, no data modified.
-- ============================================================

-- Full owners array from Plaid identity/get, stored as JSONB.
-- Structure: [{names: [], addresses: [], emails: [], phone_numbers: []}]
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS identity_owners JSONB;

-- Timestamp of the last successful identity sync for this account
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS identity_last_synced_at TIMESTAMPTZ;
