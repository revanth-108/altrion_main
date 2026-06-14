-- Migration: Add user profile fields for AFHS scoring
-- Run this against the production database

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS annual_income NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS income_source VARCHAR(50),
    ADD COLUMN IF NOT EXISTS years_to_retirement INTEGER;

COMMENT ON COLUMN public.users.date_of_birth IS 'User date of birth for life-stage weight interpolation in AFHS';
COMMENT ON COLUMN public.users.annual_income IS 'Gross annual income in USD for D1 expense estimation';
COMMENT ON COLUMN public.users.income_source IS 'Primary income source: employment, self_employed, investment, retirement, other';
COMMENT ON COLUMN public.users.years_to_retirement IS 'Manually set years to retirement (overrides age-based calculation)';
