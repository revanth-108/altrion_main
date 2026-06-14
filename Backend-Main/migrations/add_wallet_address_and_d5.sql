-- ─── Migration: add_wallet_address_and_d5 ────────────────────────────────────
-- Adds EVM wallet address to users for D5 DeFi scoring.
-- Adds d5_defi + d5_confidence columns to afhs_scores.
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. User's primary EVM wallet address (42 chars incl. 0x prefix)
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42);

-- 2. D5 DeFi dimension score + confidence in afhs_scores
ALTER TABLE public.afhs_scores
    ADD COLUMN IF NOT EXISTS d5_defi       NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS d5_confidence NUMERIC(3,2);

COMMENT ON COLUMN public.users.wallet_address IS
    'Primary EVM wallet address (0x...) used for on-chain D5 DeFi scoring via Moralis.';

COMMENT ON COLUMN public.afhs_scores.d5_defi IS
    'D5 DeFi Position Health score (0-100). NULL when user has no wallet address or no DeFi positions.';
