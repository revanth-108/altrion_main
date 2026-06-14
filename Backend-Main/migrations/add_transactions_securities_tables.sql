-- ============================================================
-- Migration: add_transactions_securities_tables
-- Purpose: Add transactions, securities, investment_transactions
--          tables and add balance/price columns to existing tables
-- Safe: additive only — no existing tables, columns, or data modified
-- Multi-user safe: all user-scoped tables have user_id FK + indexes
-- ============================================================

-- ============================================================
-- 1. SECURITIES TABLE (global — no user_id, shared across all users)
--    Plaid security_id is stable and global — AAPL is the same
--    security_id for every user who holds it.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.securities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Plaid's stable global security identifier
    security_id         VARCHAR(255) NOT NULL,
    name                VARCHAR(255),
    -- Exchange ticker e.g. AAPL, BTC — may be null for some securities
    ticker_symbol       VARCHAR(50),
    -- equity, etf, mutual fund, cryptocurrency, cash, derivative, other
    type                VARCHAR(50),
    -- True for money market funds, USD, stablecoins
    is_cash_equivalent  BOOLEAN DEFAULT FALSE,
    -- Most recent closing price
    close_price         NUMERIC(20, 8),
    currency            VARCHAR(10) DEFAULT 'USD',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- security_id is globally unique — same security = same ID for all users
ALTER TABLE public.securities
    ADD CONSTRAINT uq_securities_security_id UNIQUE (security_id);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_securities_ticker
    ON public.securities (ticker_symbol);

CREATE INDEX IF NOT EXISTS idx_securities_type
    ON public.securities (type);


-- ============================================================
-- 2. TRANSACTIONS TABLE (user-scoped)
--    Stores Plaid transaction history from /transactions/sync
--    Unique per (user_id, transaction_id) — not globally unique
--    because different environments could reuse IDs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User who owns this transaction
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Account this transaction belongs to
    account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    -- Plaid's transaction identifier — unique per user
    transaction_id      VARCHAR(255) NOT NULL,
    -- Positive = debit/outflow (you spent money)
    -- Negative = credit/inflow (you received money)
    amount              NUMERIC(20, 8) NOT NULL,
    -- Date transaction posted to account
    date                DATE NOT NULL,
    -- Date transaction was authorized (may be before posted date)
    authorized_date     DATE,
    -- Raw bank description e.g. "UBER 072515 SF**POOL**"
    name                VARCHAR(500),
    -- Cleaned merchant name e.g. "Uber"
    merchant_name       VARCHAR(255),
    -- True if transaction has not yet posted
    pending             BOOLEAN DEFAULT FALSE,
    -- online, in store, other
    payment_channel     VARCHAR(50),
    -- Plaid enriched category data
    -- e.g. TRANSPORTATION, FOOD_AND_DRINK, SHOPPING
    category_primary    VARCHAR(100),
    -- e.g. TRANSPORTATION_TAXIS_AND_RIDE_SHARES
    category_detailed   VARCHAR(100),
    -- VERY_HIGH, HIGH, MEDIUM, LOW, UNKNOWN
    category_confidence VARCHAR(50),
    -- Merchant logo URL from Plaid enrichment
    logo_url            VARCHAR(500),
    -- Merchant website from Plaid enrichment
    website             VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per user — not globally unique
ALTER TABLE public.transactions
    ADD CONSTRAINT uq_transactions_user_transaction
    UNIQUE (user_id, transaction_id);

-- Performance indexes for common query patterns
-- Most common: fetch user's recent transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC);

-- Fetch transactions for a specific account
CREATE INDEX IF NOT EXISTS idx_transactions_account_date
    ON public.transactions (account_id, date DESC);

-- Spending analysis by category
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
    ON public.transactions (user_id, category_primary);

-- Pending transaction lookup
CREATE INDEX IF NOT EXISTS idx_transactions_pending
    ON public.transactions (user_id, pending)
    WHERE pending = TRUE;


-- ============================================================
-- 3. INVESTMENT TRANSACTIONS TABLE (user-scoped)
--    Stores buy, sell, dividend, fee activity
--    from /investments/transactions/get
-- ============================================================
CREATE TABLE IF NOT EXISTS public.investment_transactions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User who owns this transaction
    user_id                     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Investment account this transaction belongs to
    account_id                  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    -- References securities.security_id (not FK to allow null securities)
    -- Nullable because some investment transactions have no security (e.g. cash transfers)
    security_id                 VARCHAR(255),
    -- Plaid's investment transaction identifier — unique per user
    investment_transaction_id   VARCHAR(255) NOT NULL,
    date                        DATE NOT NULL,
    -- Description e.g. "BUY Apple Inc." or "DIVIDEND RECEIVED"
    name                        VARCHAR(500),
    -- Number of shares/units — negative for sells
    quantity                    NUMERIC(20, 8),
    -- Total transaction value in USD
    -- Positive = cash outflow (buy), Negative = cash inflow (sell/dividend)
    amount                      NUMERIC(20, 8),
    -- Price per share at time of transaction
    price                       NUMERIC(20, 8),
    -- Transaction fees/commissions
    fees                        NUMERIC(20, 8),
    -- buy, sell, dividend, cash, transfer, fee, other
    type                        VARCHAR(50),
    -- buy, sell, dividend, interest, deposit, withdrawal, etc.
    subtype                     VARCHAR(50),
    currency                    VARCHAR(10) DEFAULT 'USD',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per user
ALTER TABLE public.investment_transactions
    ADD CONSTRAINT uq_investment_transactions_user_transaction
    UNIQUE (user_id, investment_transaction_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_inv_transactions_user_date
    ON public.investment_transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_inv_transactions_account_date
    ON public.investment_transactions (account_id, date DESC);

-- Filter by transaction type (buy/sell/dividend)
CREATE INDEX IF NOT EXISTS idx_inv_transactions_user_type
    ON public.investment_transactions (user_id, type);

-- Lookup all transactions for a specific security
CREATE INDEX IF NOT EXISTS idx_inv_transactions_security
    ON public.investment_transactions (security_id);


-- ============================================================
-- 4. ADD COLUMNS TO holdings TABLE
--    institution_price and institution_value store the price
--    and total value as reported by the institution at sync time.
--    Used for investment holdings display and gain/loss calc.
-- ============================================================

-- Price per share as reported by the institution at sync time
ALTER TABLE public.holdings
    ADD COLUMN IF NOT EXISTS institution_price NUMERIC(20, 8);

-- Total holding value (quantity × institution_price) at sync time
ALTER TABLE public.holdings
    ADD COLUMN IF NOT EXISTS institution_value NUMERIC(20, 8);


-- ============================================================
-- 5. ADD COLUMNS TO accounts TABLE
--    Store latest balance snapshot so dashboard can show
--    account-level balances without re-fetching from Plaid
-- ============================================================

-- Available balance — spendable amount (null for investment/loan accounts)
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS balance_available NUMERIC(20, 8);

-- Current/posted balance
-- For credit accounts: outstanding balance (positive = you owe)
-- For depository: posted balance
-- For investment: total portfolio value
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS balance_current NUMERIC(20, 8);

-- Credit limit — only populated for credit card accounts
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS balance_limit NUMERIC(20, 8);

-- Currency code for balances e.g. USD, EUR
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS balance_currency VARCHAR(10) DEFAULT 'USD';
