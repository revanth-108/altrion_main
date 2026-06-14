-- ============================================================
-- Migration: add_liabilities_table
-- Purpose: Add liabilities table to store credit card, mortgage,
--          and student loan data from Plaid /liabilities/get
-- Safe: additive only — no existing tables, columns, or data modified
-- Multi-user safe: user-scoped with user_id FK + indexes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.liabilities (
    id                                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this liability
    user_id                                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Account this liability belongs to (nullable — SET NULL if account row is deleted)
    account_id                              UUID REFERENCES public.accounts(id) ON DELETE SET NULL,

    -- Plaid account_id — used as the upsert key alongside user_id + liability_type
    provider_account_id                     VARCHAR(255) NOT NULL,

    -- Discriminator: 'credit', 'mortgage', or 'student'
    liability_type                          VARCHAR(20) NOT NULL,


    -- --------------------------------------------------------
    -- CREDIT-SPECIFIC columns (nullable — only set when liability_type = 'credit')
    -- --------------------------------------------------------

    -- Primary APR percentage (from aprs[0])
    credit_apr_percentage                   NUMERIC(8, 4),
    -- APR type e.g. 'interest_charge_billed', 'purchase_apr', 'cash_apr'
    credit_apr_type                         VARCHAR(50),
    credit_last_payment_amount              NUMERIC(20, 8),
    credit_last_payment_date                DATE,
    credit_last_statement_balance           NUMERIC(20, 8),
    credit_last_statement_issue_date        DATE,
    credit_minimum_payment_amount           NUMERIC(20, 8),
    credit_next_payment_due_date            DATE,
    credit_is_overdue                       BOOLEAN,


    -- --------------------------------------------------------
    -- MORTGAGE-SPECIFIC columns (nullable — only set when liability_type = 'mortgage')
    -- --------------------------------------------------------

    mortgage_interest_rate_percentage       NUMERIC(8, 4),
    -- 'fixed' or 'variable'
    mortgage_interest_rate_type             VARCHAR(20),
    mortgage_last_payment_amount            NUMERIC(20, 8),
    mortgage_last_payment_date              DATE,
    mortgage_maturity_date                  DATE,
    mortgage_next_monthly_payment           NUMERIC(20, 8),
    mortgage_next_payment_due_date          DATE,
    mortgage_origination_principal_amount   NUMERIC(20, 8),
    mortgage_outstanding_principal_amount   NUMERIC(20, 8),
    mortgage_ytd_interest_paid              NUMERIC(20, 8),
    mortgage_ytd_principal_paid             NUMERIC(20, 8),
    -- Concatenated property address string
    mortgage_property_address               TEXT,


    -- --------------------------------------------------------
    -- STUDENT-SPECIFIC columns (nullable — only set when liability_type = 'student')
    -- --------------------------------------------------------

    -- List of disbursement dates stored as JSONB array
    student_disbursement_dates              JSONB,
    student_expected_payoff_date            DATE,
    student_guarantor                       VARCHAR(255),
    student_interest_rate_percentage        NUMERIC(8, 4),
    student_is_overdue                      BOOLEAN,
    student_last_payment_amount             NUMERIC(20, 8),
    student_last_payment_date               DATE,
    student_last_statement_balance          NUMERIC(20, 8),
    student_loan_name                       VARCHAR(255),
    -- e.g. 'repayment', 'in_school', 'deferment', 'grace_period'
    student_loan_status_type                VARCHAR(50),
    student_minimum_payment_amount          NUMERIC(20, 8),
    student_next_payment_due_date           DATE,
    student_origination_principal_amount    NUMERIC(20, 8),
    student_outstanding_interest_amount     NUMERIC(20, 8),
    student_payment_reference_number        VARCHAR(255),
    -- From pslf_status nested object
    student_pslf_estimated_eligibility_date DATE,
    student_pslf_payments_made              INTEGER,
    student_pslf_payments_remaining         INTEGER,
    -- e.g. 'income_contingent_repayment', 'standard'
    student_repayment_plan_type             VARCHAR(100),
    -- Concatenated servicer address string
    student_servicer_address                TEXT,
    student_sequence_number                 VARCHAR(50),


    -- --------------------------------------------------------
    -- Timestamps
    -- --------------------------------------------------------

    last_synced_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --------------------------------------------------------
-- Unique constraint — upsert key
-- One row per (user, plaid account, liability type)
-- NULL values do not conflict in Postgres UNIQUE constraints, so
-- provider_account_id must always be populated
-- --------------------------------------------------------
ALTER TABLE public.liabilities
    ADD CONSTRAINT uq_liabilities_user_account_type
    UNIQUE (user_id, provider_account_id, liability_type);


-- --------------------------------------------------------
-- Indexes for common query patterns
-- --------------------------------------------------------

-- Most common: fetch all liabilities for a user
CREATE INDEX IF NOT EXISTS idx_liabilities_user_id
    ON public.liabilities (user_id);

-- Fetch liabilities for a specific account
CREATE INDEX IF NOT EXISTS idx_liabilities_account_id
    ON public.liabilities (account_id);

-- Filter by type across a user's liabilities
CREATE INDEX IF NOT EXISTS idx_liabilities_user_type
    ON public.liabilities (user_id, liability_type);
