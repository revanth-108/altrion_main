-- Migration: add_asset_metadata_table
-- Purpose: add global asset metadata cache and correct cash/stable mappings

CREATE TABLE IF NOT EXISTS public.asset_metadata (
    asset_key         VARCHAR(80) PRIMARY KEY,
    canonical_symbol  VARCHAR(20) NOT NULL,
    asset_class       VARCHAR(50) NOT NULL,
    display_name      VARCHAR(255),
    metadata_source   VARCHAR(50) NOT NULL DEFAULT 'internal',
    metadata_status   VARCHAR(50) NOT NULL DEFAULT 'pending',
    sector            VARCHAR(255),
    industry          VARCHAR(255),
    country           VARCHAR(100),
    cik               VARCHAR(50),
    isin              VARCHAR(50),
    coingecko_id      VARCHAR(100),
    fmp_symbol        VARCHAR(50),
    tags_json         JSONB,
    raw_payload_json  JSONB,
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_refreshed_at TIMESTAMPTZ,
    refresh_after     TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_metadata_symbol
    ON public.asset_metadata (canonical_symbol);

CREATE INDEX IF NOT EXISTS idx_asset_metadata_class
    ON public.asset_metadata (asset_class);

CREATE INDEX IF NOT EXISTS idx_asset_metadata_status
    ON public.asset_metadata (metadata_status);

CREATE INDEX IF NOT EXISTS idx_asset_metadata_refresh_after
    ON public.asset_metadata (refresh_after);

-- Correct provider symbol mappings so fiat cash remains fiat and stablecoins remain crypto.
UPDATE public.asset_mappings
SET canonical_symbol = 'USD',
    asset_class = 'cash_equivalent',
    updated_at = NOW()
WHERE provider = 'plaid'
  AND provider_symbol IN ('USD', 'US DOLLAR');

UPDATE public.asset_mappings
SET canonical_symbol = provider_symbol,
    asset_class = 'crypto',
    updated_at = NOW()
WHERE provider IN ('coinbase', 'wallet')
  AND provider_symbol IN ('USDC', 'USDT', 'DAI', 'PYUSD');

-- Repair older Plaid fiat holdings that were stored as USDC due to previous mapping.
-- If a true USD cash row already exists for the same account, merge balances first
-- so the subsequent symbol rewrite does not violate the unique index.
WITH duplicate_cash_rows AS (
    SELECT legacy.id AS legacy_id,
           existing_usd.id AS usd_id,
           legacy.quantity + existing_usd.quantity AS merged_quantity
    FROM public.holdings legacy
    JOIN public.holdings existing_usd
      ON existing_usd.account_id = legacy.account_id
     AND existing_usd.source = 'plaid'
     AND existing_usd.asset_class = 'cash_equivalent'
     AND existing_usd.canonical_symbol = 'USD'
     AND existing_usd.security_id IS NULL
    WHERE legacy.source = 'plaid'
      AND legacy.asset_class = 'cash_equivalent'
      AND legacy.canonical_symbol = 'USDC'
      AND legacy.security_id IS NULL
)
UPDATE public.holdings legacy
SET quantity = duplicate_cash_rows.merged_quantity,
    last_updated = NOW()
FROM duplicate_cash_rows
WHERE legacy.id = duplicate_cash_rows.legacy_id;

WITH duplicate_cash_rows AS (
    SELECT legacy.id AS legacy_id,
           existing_usd.id AS usd_id
    FROM public.holdings legacy
    JOIN public.holdings existing_usd
      ON existing_usd.account_id = legacy.account_id
     AND existing_usd.source = 'plaid'
     AND existing_usd.asset_class = 'cash_equivalent'
     AND existing_usd.canonical_symbol = 'USD'
     AND existing_usd.security_id IS NULL
    WHERE legacy.source = 'plaid'
      AND legacy.asset_class = 'cash_equivalent'
      AND legacy.canonical_symbol = 'USDC'
      AND legacy.security_id IS NULL
)
DELETE FROM public.holdings existing_usd
USING duplicate_cash_rows
WHERE existing_usd.id = duplicate_cash_rows.usd_id;

UPDATE public.holdings
SET canonical_symbol = 'USD',
    last_updated = NOW()
WHERE source = 'plaid'
  AND asset_class = 'cash_equivalent'
  AND canonical_symbol = 'USDC'
  AND security_id IS NULL;
