-- ============================================================
-- fix_schema_correctness.sql
-- Applies all model-level correctness fixes.
-- Safe to run multiple times (IF NOT EXISTS / DO $$ guards).
-- ============================================================

-- ── 1. Float → Numeric on loan_calculations ─────────────────
-- IEEE Float causes silent rounding on financial values.
ALTER TABLE public.loan_calculations
    ALTER COLUMN total_collateral_usd  TYPE NUMERIC(20, 8) USING total_collateral_usd::NUMERIC(20, 8),
    ALTER COLUMN total_loan_usd        TYPE NUMERIC(20, 8) USING total_loan_usd::NUMERIC(20, 8),
    ALTER COLUMN portfolio_ltv_pct     TYPE NUMERIC(8,  4) USING portfolio_ltv_pct::NUMERIC(8,  4),
    ALTER COLUMN interest_rate_pct     TYPE NUMERIC(8,  4) USING interest_rate_pct::NUMERIC(8,  4),
    ALTER COLUMN monthly_emi_usd       TYPE NUMERIC(20, 8) USING monthly_emi_usd::NUMERIC(20, 8),
    ALTER COLUMN margin_call_ltv_pct   TYPE NUMERIC(8,  4) USING margin_call_ltv_pct::NUMERIC(8,  4),
    ALTER COLUMN liquidation_ltv_pct   TYPE NUMERIC(8,  4) USING liquidation_ltv_pct::NUMERIC(8,  4);

-- ── 2. Float → Numeric on loan_calculation_assets ───────────
ALTER TABLE public.loan_calculation_assets
    ALTER COLUMN collateral_usd        TYPE NUMERIC(20, 8)  USING collateral_usd::NUMERIC(20, 8),
    ALTER COLUMN loan_usd              TYPE NUMERIC(20, 8)  USING loan_usd::NUMERIC(20, 8),
    ALTER COLUMN ltv_frac              TYPE NUMERIC(10, 8)  USING ltv_frac::NUMERIC(10, 8),
    ALTER COLUMN interest_rate_frac    TYPE NUMERIC(10, 8)  USING interest_rate_frac::NUMERIC(10, 8),
    ALTER COLUMN base_rate_frac        TYPE NUMERIC(10, 8)  USING base_rate_frac::NUMERIC(10, 8),
    ALTER COLUMN risk_premium_frac     TYPE NUMERIC(10, 8)  USING risk_premium_frac::NUMERIC(10, 8),
    ALTER COLUMN volatility_premium_frac TYPE NUMERIC(10, 8) USING volatility_premium_frac::NUMERIC(10, 8),
    ALTER COLUMN pct_change_30d        TYPE NUMERIC(12, 6)  USING pct_change_30d::NUMERIC(12, 6);

-- ── 3. Add FK from afhs_scores → users ──────────────────────
-- Orphaned score rows accumulate without this; CASCADE keeps scores
-- in sync with GDPR deletions.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_afhs_scores_user_id'
          AND conrelid = 'public.afhs_scores'::regclass
    ) THEN
        ALTER TABLE public.afhs_scores
            ADD CONSTRAINT fk_afhs_scores_user_id
            FOREIGN KEY (user_id)
            REFERENCES public.users(id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- Composite index for trend/history queries (analysis.py: ORDER BY computed_at DESC)
CREATE INDEX IF NOT EXISTS idx_afhs_scores_user_computed_at
    ON public.afhs_scores (user_id, computed_at);

-- ── 4. Unique constraint on payment_methods ──────────────────
-- Prevents duplicate Stripe payment method rows per user.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_payment_methods_user_stripe_pm'
          AND conrelid = 'public.payment_methods'::regclass
    ) THEN
        ALTER TABLE public.payment_methods
            ADD CONSTRAINT uq_payment_methods_user_stripe_pm
            UNIQUE (user_id, stripe_payment_method_id);
    END IF;
END $$;

-- ── 5. Check constraint on subscription_overrides ────────────
-- Prevents conflicting discount types being set simultaneously.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_subscription_overrides_single_discount'
          AND conrelid = 'public.subscription_overrides'::regclass
    ) THEN
        ALTER TABLE public.subscription_overrides
            ADD CONSTRAINT chk_subscription_overrides_single_discount CHECK (
                (is_waived = TRUE) OR (
                    (CASE WHEN override_price      IS NOT NULL THEN 1 ELSE 0 END
                   + CASE WHEN discount_percentage IS NOT NULL THEN 1 ELSE 0 END
                   + CASE WHEN discount_fixed      IS NOT NULL THEN 1 ELSE 0 END) <= 1
                )
            );
    END IF;
END $$;

-- ── 6. Composite index on recurring_streams(user_id, is_active) ─
-- budget controller line 76: WHERE user_id = ? AND is_active = TRUE
CREATE INDEX IF NOT EXISTS idx_recurring_streams_user_active
    ON public.recurring_streams (user_id, is_active);
