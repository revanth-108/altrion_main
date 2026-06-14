-- Migration: add_etf_sector_weights_column
-- Purpose: Store Yahoo Finance sectorWeightings alongside ETF constituent cache.
--          One value per (etf_symbol, constituent_symbol) row — same JSON repeated
--          for all rows of the same ETF.  Stored in the row with the highest weight
--          and back-filled on read.  NULL = sector weights not yet fetched.

ALTER TABLE public.etf_constituents
    ADD COLUMN IF NOT EXISTS sector_weights_json JSONB;

COMMENT ON COLUMN public.etf_constituents.sector_weights_json IS
    'Yahoo Finance sectorWeightings for this ETF {standard_sector: weight_pct_0_to_100}. '
    'Stored on every constituent row for the same ETF so any single row can rebuild the map.';
