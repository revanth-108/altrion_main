-- Database Optimization & Scaling Improvements (FIXED)
-- This migration adds comprehensive indexing and performance improvements

-- 1. Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status 
ON subscriptions(user_id, status) 
WHERE status IN ('active', 'trialing');

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ending 
ON subscriptions(trial_end) 
WHERE status = 'trialing' AND trial_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal 
ON subscriptions(current_period_end) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription_date 
ON subscription_history(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code_active 
ON promo_codes(code) 
WHERE is_active = true;

-- 2. Add partial indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_subscription_overrides_waived 
ON subscription_overrides(user_id) 
WHERE is_waived = true;

-- 3. Add database-level check constraint for trial logic
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS chk_trial_dates;

ALTER TABLE subscriptions 
ADD CONSTRAINT chk_trial_dates 
CHECK (
    (status != 'trialing') OR 
    (status = 'trialing' AND trial_start IS NOT NULL AND trial_end IS NOT NULL)
);

-- 4. Create index for connection pooling and concurrent access
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id 
ON subscriptions(stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer 
ON subscriptions(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- 5. Add statistics targets for better query planning
ALTER TABLE subscriptions ALTER COLUMN status SET STATISTICS 1000;
ALTER TABLE subscriptions ALTER COLUMN user_id SET STATISTICS 1000;

-- 6. Add comments for locking hints
COMMENT ON TABLE subscriptions IS 'Main subscriptions table. Use SELECT ... FOR UPDATE when modifying subscription status to prevent race conditions.';
COMMENT ON TABLE subscription_overrides IS 'User-specific pricing overrides. Use row-level locks when applying/removing overrides.';

-- 7. Run ANALYZE to update statistics
ANALYZE subscriptions;
ANALYZE subscription_plans;
ANALYZE subscription_overrides;
ANALYZE promo_codes;
