-- ============================================================
-- Migration: add_budget_allocations_table
-- Purpose: Create the budget_allocations table used by the
--          /budget endpoint to store user-defined allocation
--          edges between income, bank, and outflow canvas nodes.
-- Safe: additive only — no existing tables, columns, or data modified
-- Re-run safe: all statements use IF NOT EXISTS guards
-- Multi-user safe: user-scoped with user_id FK + index
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budget_allocations (

    -- Auto-incrementing surrogate PK (integer is sufficient — this is
    -- an application-only table, not synced from an external provider)
    id                  SERIAL PRIMARY KEY,

    -- User who owns this allocation edge
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Frontend canvas node IDs — not DB foreign keys.
    -- Convention:
    --   income-<stream_id>    → recurring inflow stream
    --   bank-<account.id>     → depository account
    --   outflow-<stream_id>   → recurring outflow stream
    source_id           VARCHAR(255) NOT NULL,
    target_id           VARCHAR(255) NOT NULL,

    -- Semantic edge type — used by the frontend to style arrows.
    -- Values: 'income-bank', 'bank-outflow', 'bank-bank'
    allocation_type     VARCHAR(50) NOT NULL,

    -- Allocated dollar amount, stored to 2 decimal places
    amount              NUMERIC(12, 2) NOT NULL,

    -- Optional user-supplied note (e.g. "rent reserve")
    note                TEXT,

    -- Optional informal due-date string (e.g. "15th", "end of month")
    -- Stored as plain text because due dates are often user-defined and informal
    due_date            VARCHAR(50),

    -- Soft-delete flag — allows disabling edges without destroying history
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- Unique constraint — upsert key
-- At most one allocation per (user, source→target) edge.
-- The POST /budget/allocations handler detects existing rows
-- via this constraint and updates them rather than inserting duplicates.
-- ============================================================
ALTER TABLE public.budget_allocations
    ADD CONSTRAINT uq_budget_allocations_user_source_target
    UNIQUE (user_id, source_id, target_id);


-- ============================================================
-- Indexes for common query patterns
-- ============================================================

-- Most common: fetch all allocations for a user (GET /budget)
CREATE INDEX IF NOT EXISTS idx_budget_allocations_user_id
    ON public.budget_allocations (user_id);

-- Lookup all allocations originating from a specific node
CREATE INDEX IF NOT EXISTS idx_budget_allocations_source
    ON public.budget_allocations (user_id, source_id);

-- Lookup all allocations targeting a specific node
CREATE INDEX IF NOT EXISTS idx_budget_allocations_target
    ON public.budget_allocations (user_id, target_id);
