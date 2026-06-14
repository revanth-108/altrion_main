-- ─── AFHS Score History Table ────────────────────────────────────────────────
-- Migration: add_afhs_scores_table
-- Stores a point-in-time AFHS score snapshot per user for D7 trajectory and
-- historical trend display.  One row per computation event.
-- Run this after complete_db_setup.sql.

CREATE TABLE IF NOT EXISTS afhs_scores (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Composite
    overall_score   SMALLINT    NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    completeness_pct SMALLINT   NOT NULL DEFAULT 50,
    life_stage      VARCHAR(20) NOT NULL,
    solvency_tier   VARCHAR(20) NOT NULL DEFAULT 'solvent',

    -- Dimension scores (NULL = dimension inactive or data unavailable)
    d1_liquidity    NUMERIC(5,2),
    d2_investment   NUMERIC(5,2),
    d3_retirement   NUMERIC(5,2),
    d4_crypto       NUMERIC(5,2),
    d6_debt         NUMERIC(5,2),
    d7_velocity     NUMERIC(5,2),

    -- Confidence factors per dimension (0.0 – 1.0)
    d1_confidence   NUMERIC(3,2),
    d2_confidence   NUMERIC(3,2),
    d3_confidence   NUMERIC(3,2),
    d4_confidence   NUMERIC(3,2),
    d6_confidence   NUMERIC(3,2),
    d7_confidence   NUMERIC(3,2),

    -- Full breakdown JSON for audit / debug
    breakdown       JSONB,

    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-user history queries (D7 uses last 90 days)
CREATE INDEX IF NOT EXISTS idx_afhs_scores_user_time
    ON afhs_scores (user_id, computed_at DESC);

-- Index for cohort / peer comparison queries (Track B)
CREATE INDEX IF NOT EXISTS idx_afhs_scores_life_stage_time
    ON afhs_scores (life_stage, computed_at DESC);

COMMENT ON TABLE afhs_scores IS
    'Point-in-time AFHS score snapshots. Used for D7 trajectory, trend charts, '
    'and Track B peer comparisons.';
