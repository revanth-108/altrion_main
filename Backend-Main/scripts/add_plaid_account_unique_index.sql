-- Run after duplicate Plaid accounts have been cleaned up.
-- This enforces one Plaid account per:
-- user_id + provider + item_id + provider_account_id
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_accounts_plaid_user_item_provider_account
ON public.accounts (user_id, provider, item_id, provider_account_id)
WHERE provider = 'plaid'
  AND is_active = TRUE
  AND item_id IS NOT NULL;
