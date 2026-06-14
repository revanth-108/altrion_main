-- Complete Database Setup Script for Altrion
-- This script is idempotent - safe to run multiple times
-- Run this in Supabase SQL Editor

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
CREATE INDEX IF NOT EXISTS idx_holdings_account_symbol ON public.holdings(account_id, canonical_symbol);

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
CREATE INDEX IF NOT EXISTS idx_asset_mapping_provider_symbol ON public.asset_mappings(provider, provider_symbol);

-- 5. Create prices table
CREATE TABLE IF NOT EXISTS public.prices (
    id VARCHAR(20) PRIMARY KEY,
    canonical_symbol VARCHAR(20) UNIQUE NOT NULL,
    usd_price NUMERIC(36, 18) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'coinmarketcap',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_prices_canonical_symbol ON public.prices(canonical_symbol);

-- 6. Create provider_tokens table
CREATE TABLE IF NOT EXISTS public.provider_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    token_data JSONB NOT NULL,
    institution_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_tokens_user_provider UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_tokens_user_id ON public.provider_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_provider ON public.provider_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_institution_id ON public.provider_tokens(institution_id);

-- Enable Row Level Security on provider_tokens
ALTER TABLE public.provider_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create new one
DO $$ 
BEGIN
    -- Drop policy if exists
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'provider_tokens' 
        AND policyname = 'Users can access their own tokens'
    ) THEN
        DROP POLICY "Users can access their own tokens" ON public.provider_tokens;
    END IF;
    
    -- Create policy
    CREATE POLICY "Users can access their own tokens"
        ON public.provider_tokens
        FOR ALL
        USING (auth.uid()::text = user_id::text);
END $$;

-- 7. Insert asset symbol mappings (using ON CONFLICT to avoid duplicates)
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
ON CONFLICT (id) DO UPDATE SET
    provider_symbol = EXCLUDED.provider_symbol,
    canonical_symbol = EXCLUDED.canonical_symbol,
    asset_class = EXCLUDED.asset_class,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

COMMIT;

-- Success message
DO $$
DECLARE
    table_count INTEGER;
    mapping_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'accounts', 'holdings', 'asset_mappings', 'prices', 'provider_tokens');
    
    -- Count mappings
    SELECT COUNT(*) INTO mapping_count
    FROM public.asset_mappings;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Database setup completed successfully!';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Tables created/verified: % tables', table_count;
    RAISE NOTICE '🗺️  Asset mappings: % rows', mapping_count;
    RAISE NOTICE '🔐 RLS enabled on provider_tokens table';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';
    RAISE NOTICE '✨ Your database is ready to use!';
    RAISE NOTICE '';
END $$;
