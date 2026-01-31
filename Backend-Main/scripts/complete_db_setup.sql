-- Complete Database Setup Script for Altrion
-- Run this in Supabase SQL Editor to create all tables at once
-- This bypasses Python connection issues

BEGIN;

-- 1. Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_supabase_user_id ON public.users(supabase_user_id);
CREATE INDEX IF NOT EXISTS ix_users_email ON public.users(email);

-- 2. Create accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    account_type VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS ix_accounts_provider ON public.accounts(provider);

-- 3. Create holdings table (canonical truth layer)
CREATE TABLE IF NOT EXISTS public.holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    canonical_symbol VARCHAR(20) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    quantity NUMERIC(36, 18) NOT NULL,
    source VARCHAR(50) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_holdings_account_symbol UNIQUE(account_id, canonical_symbol)
);

CREATE INDEX IF NOT EXISTS ix_holdings_user_id ON public.holdings(user_id);
CREATE INDEX IF NOT EXISTS ix_holdings_account_id ON public.holdings(account_id);
CREATE INDEX IF NOT EXISTS ix_holdings_canonical_symbol ON public.holdings(canonical_symbol);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_account_symbol ON public.holdings(account_id, canonical_symbol);

-- 4. Create asset_mappings table
CREATE TABLE IF NOT EXISTS public.asset_mappings (
    id VARCHAR(50) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_symbol VARCHAR(100) NOT NULL,
    canonical_symbol VARCHAR(20) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asset_mapping_provider_symbol UNIQUE(provider, provider_symbol)
);

CREATE INDEX IF NOT EXISTS ix_asset_mappings_provider ON public.asset_mappings(provider);
CREATE INDEX IF NOT EXISTS ix_asset_mappings_canonical_symbol ON public.asset_mappings(canonical_symbol);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_mapping_provider_symbol ON public.asset_mappings(provider, provider_symbol);

-- 5. Create prices table
CREATE TABLE IF NOT EXISTS public.prices (
    id VARCHAR(20) PRIMARY KEY,
    canonical_symbol VARCHAR(20) UNIQUE NOT NULL,
    usd_price NUMERIC(36, 18) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'coinmarketcap',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_prices_canonical_symbol ON public.prices(canonical_symbol);

-- 6. Create provider_tokens table
CREATE TABLE IF NOT EXISTS public.provider_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    token_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_tokens_user_provider UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_tokens_user_id ON public.provider_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_provider ON public.provider_tokens(provider);

-- Enable Row Level Security on provider_tokens
ALTER TABLE public.provider_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for provider_tokens (drop first if exists)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can access their own tokens" ON public.provider_tokens;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users can access their own tokens"
    ON public.provider_tokens
    FOR ALL
    USING (auth.uid()::text = user_id::text);

-- 7. Insert asset symbol mappings
INSERT INTO public.asset_mappings (id, provider, provider_symbol, canonical_symbol, asset_class, is_active) VALUES
-- Coinbase mappings
('BTC_coinbase', 'coinbase', 'BTC', 'BTC', 'crypto', true),
('ETH_coinbase', 'coinbase', 'ETH', 'ETH', 'crypto', true),
('USDC_coinbase', 'coinbase', 'USDC', 'USDC', 'cash_equivalent', true),
('USDT_coinbase', 'coinbase', 'USDT', 'USDT', 'cash_equivalent', true),
('SOL_coinbase', 'coinbase', 'SOL', 'SOL', 'crypto', true),
('ADA_coinbase', 'coinbase', 'ADA', 'ADA', 'crypto', true),
('DOT_coinbase', 'coinbase', 'DOT', 'DOT', 'crypto', true),
('MATIC_coinbase', 'coinbase', 'MATIC', 'MATIC', 'crypto', true),
('AVAX_coinbase', 'coinbase', 'AVAX', 'AVAX', 'crypto', true),
('LINK_coinbase', 'coinbase', 'LINK', 'LINK', 'crypto', true),

-- Plaid mappings
('USD_plaid', 'plaid', 'USD', 'USDC', 'cash_equivalent', true),
('US Dollar_plaid', 'plaid', 'US DOLLAR', 'USDC', 'cash_equivalent', true),
('Bitcoin_plaid', 'plaid', 'BITCOIN', 'BTC', 'crypto', true),
('Ethereum_plaid', 'plaid', 'ETHEREUM', 'ETH', 'crypto', true),

-- Wallet mappings
('BTC_wallet', 'wallet', 'BTC', 'BTC', 'crypto', true),
('ETH_wallet', 'wallet', 'ETH', 'ETH', 'crypto', true),
('USDC_wallet', 'wallet', 'USDC', 'USDC', 'cash_equivalent', true),
('USDT_wallet', 'wallet', 'USDT', 'USDT', 'cash_equivalent', true),
('SOL_wallet', 'wallet', 'SOL', 'SOL', 'crypto', true),
('WETH_wallet', 'wallet', 'WETH', 'ETH', 'crypto', true),
('WBTC_wallet', 'wallet', 'WBTC', 'BTC', 'crypto', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ All tables and asset mappings created successfully!';
    RAISE NOTICE '📊 Tables created: users, accounts, holdings, asset_mappings, prices, provider_tokens';
    RAISE NOTICE '🗺️  Asset mappings: % rows inserted', (SELECT COUNT(*) FROM public.asset_mappings);
END $$;
