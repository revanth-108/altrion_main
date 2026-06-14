-- Keep customer payout intent separate from internal/admin payment rails.
-- Users choose payout_method; admins can later assign admin_payment_rail such as 'bofa'.

ALTER TABLE public.loan_calculations
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payout_method VARCHAR(64),
    ADD COLUMN IF NOT EXISTS admin_payment_rail VARCHAR(64),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) NOT NULL DEFAULT 'pending';

UPDATE public.loan_calculations
SET payout_method = CASE
    WHEN payout_currency = 'USDT' THEN 'stablecoin_transfer'
    ELSE 'bank_transfer'
END
WHERE payout_method IS NULL;

CREATE INDEX IF NOT EXISTS idx_loan_calculations_payout_method
    ON public.loan_calculations (payout_method);

CREATE INDEX IF NOT EXISTS idx_loan_calculations_user_id
    ON public.loan_calculations (user_id);

CREATE INDEX IF NOT EXISTS idx_loan_calculations_admin_payment_rail
    ON public.loan_calculations (admin_payment_rail);

CREATE INDEX IF NOT EXISTS idx_loan_calculations_payment_status
    ON public.loan_calculations (payment_status);
