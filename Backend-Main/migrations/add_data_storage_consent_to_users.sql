-- ============================================================
-- Migration: add_data_storage_consent_to_users
-- Purpose: Track whether a user opted into storing Plaid/user data.
-- Consent must be explicit, so rows default to false until onboarding
-- records the user's choice.
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS data_storage_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS data_storage_consent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS data_storage_consent_version VARCHAR(50);

COMMENT ON COLUMN public.users.data_storage_consent IS 'True when the user consented to backend storage of Plaid/user data.';
COMMENT ON COLUMN public.users.data_storage_consent_at IS 'Timestamp when storage consent was last granted; null when not granted.';
COMMENT ON COLUMN public.users.data_storage_consent_version IS 'Consent copy/version accepted by the user.';
