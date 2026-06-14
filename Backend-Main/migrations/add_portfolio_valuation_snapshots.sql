-- Portfolio valuation snapshots for real 24h portfolio change.

CREATE TABLE IF NOT EXISTS public.portfolio_valuation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_value NUMERIC(20, 8) NOT NULL,
    categories JSONB,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_valuation_snapshots_user_time
    ON public.portfolio_valuation_snapshots(user_id, computed_at DESC);

COMMENT ON TABLE public.portfolio_valuation_snapshots IS
    'Point-in-time portfolio total valuations used to compute real 24h portfolio change.';

COMMENT ON COLUMN public.portfolio_valuation_snapshots.total_value IS
    'Total portfolio valuation in USD at snapshot time.';
