-- ============================================================
-- Field-level encryption schema migration
-- AES-256-GCM encrypted values are base64 strings that are
-- always longer than the original value, so all encrypted
-- columns must be widened to TEXT.
-- Run BEFORE executing scripts/encrypt_existing_data.py
-- ============================================================

-- users: name, income_source, wallet_address
ALTER TABLE public.users
    ALTER COLUMN name        TYPE TEXT,
    ALTER COLUMN income_source TYPE TEXT,
    ALTER COLUMN wallet_address TYPE TEXT;

-- accounts: name, mask, institution_name
ALTER TABLE public.accounts
    ALTER COLUMN name             TYPE TEXT,
    ALTER COLUMN mask             TYPE TEXT,
    ALTER COLUMN institution_name TYPE TEXT;

-- transactions: name, merchant_name
ALTER TABLE public.transactions
    ALTER COLUMN name          TYPE TEXT,
    ALTER COLUMN merchant_name TYPE TEXT;

-- provider_tokens: token_data  JSONB → TEXT
-- The USING clause serialises the existing JSON to its text representation
-- so no data is lost; encrypt_existing_data.py will then encrypt it.
ALTER TABLE public.provider_tokens
    ALTER COLUMN token_data TYPE TEXT USING token_data::TEXT;

-- loan_calculations: client_ip, user_agent
ALTER TABLE public.loan_calculations
    ALTER COLUMN client_ip   TYPE TEXT,
    ALTER COLUMN user_agent  TYPE TEXT;
