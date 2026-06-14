-- Migration: add_etf_constituents_table
-- Purpose: Cache ETF constituent holdings fetched from FMP /v3/etf-holder/{symbol}
--          Used by Portfolio X-Ray ETF look-through to compute true per-stock exposure.
--          TTL = 7 days (refresh_after column controls staleness).

CREATE TABLE IF NOT EXISTS public.etf_constituents (
    etf_symbol          VARCHAR(20)     NOT NULL,
    constituent_symbol  VARCHAR(20)     NOT NULL,
    constituent_name    VARCHAR(255),
    weight_pct          NUMERIC(10, 4),
    shares              BIGINT,
    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    refresh_after       TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (etf_symbol, constituent_symbol)
);

-- Speed up look-ups by ETF (batch SELECT in get_many)
CREATE INDEX IF NOT EXISTS idx_etf_constituents_etf_symbol
    ON public.etf_constituents (etf_symbol);

-- Speed up staleness check (WHERE refresh_after > NOW())
CREATE INDEX IF NOT EXISTS idx_etf_constituents_refresh_after
    ON public.etf_constituents (refresh_after);

-- Allow fast weight-ordered reads per ETF
CREATE INDEX IF NOT EXISTS idx_etf_constituents_etf_weight
    ON public.etf_constituents (etf_symbol, weight_pct DESC);

COMMENT ON TABLE public.etf_constituents IS
    'Cache of top-100 ETF constituent weights fetched from FMP. '
    'Populated on-demand by ETFLookthroughService; stale after refresh_after.';
