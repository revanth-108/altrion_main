-- Database Optimization & Scaling Improvements
-- This migration adds comprehensive indexing, partitioning, and performance improvements

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

CREATE INDEX IF NOT EXISTS idx_promo_codes_active 
ON promo_codes(code) 
WHERE is_active = true AND (valid_until IS NULL OR valid_until > NOW());

-- 2. Add partial indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_subscription_overrides_active 
ON subscription_overrides(user_id) 
WHERE is_waived = true;

-- 3. Create materialized view for analytics (faster admin dashboard)
CREATE MATERIALIZED VIEW IF NOT EXISTS subscription_analytics AS
SELECT 
    DATE_TRUNC('day', s.created_at) as date,
    s.status,
    sp.name as plan_name,
    COUNT(*) as count,
    SUM(CASE WHEN so.is_waived THEN 0 ELSE COALESCE(so.override_price, sp.base_price) END) as total_mrr,
    COUNT(CASE WHEN s.trial_end > NOW() THEN 1 END) as active_trials,
    COUNT(CASE WHEN s.cancel_at_period_end THEN 1 END) as pending_cancellations
FROM subscriptions s
LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
LEFT JOIN subscription_overrides so ON s.user_id = so.user_id
GROUP BY DATE_TRUNC('day', s.created_at), s.status, sp.name;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_analytics_unique 
ON subscription_analytics(date, status, plan_name);

-- 4. Add database-level check constraint for trial logic
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS chk_trial_dates,
ADD CONSTRAINT chk_trial_dates 
CHECK (
    (status != 'trialing') OR 
    (status = 'trialing' AND trial_start IS NOT NULL AND trial_end IS NOT NULL)
);

-- 5. Create function to automatically refresh analytics (call from cron)
CREATE OR REPLACE FUNCTION refresh_subscription_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY subscription_analytics;
END;
$$ LANGUAGE plpgsql;

-- 6. Add function to check and expire trials (call from cron every hour)
CREATE OR REPLACE FUNCTION expire_trials()
RETURNS TABLE(expired_count INT) AS $$
DECLARE
    updated_count INT;
BEGIN
    -- Expire trials that have ended
    UPDATE subscriptions
    SET 
        status = 'canceled',
        updated_at = NOW()
    WHERE 
        status = 'trialing' 
        AND trial_end < NOW()
        AND NOT EXISTS (
            SELECT 1 FROM subscription_overrides so 
            WHERE so.user_id = subscriptions.user_id AND so.is_waived = true
        );
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Log the expiration
    INSERT INTO subscription_history (subscription_id, action, new_state, performed_by)
    SELECT 
        id,
        'trial_expired',
        jsonb_build_object(
            'expired_at', NOW(),
            'trial_end', trial_end
        ),
        'system'
    FROM subscriptions
    WHERE 
        status = 'canceled' 
        AND updated_at > NOW() - INTERVAL '1 minute';
    
    RETURN QUERY SELECT updated_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Add function to send trial ending reminders (call from cron daily)
CREATE OR REPLACE FUNCTION get_trials_ending_soon(days_before INT DEFAULT 3)
RETURNS TABLE(
    user_id UUID,
    email VARCHAR,
    trial_end TIMESTAMP WITH TIME ZONE,
    days_remaining INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.user_id,
        u.email,
        s.trial_end,
        EXTRACT(DAY FROM s.trial_end - NOW())::INT as days_remaining
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE 
        s.status = 'trialing'
        AND s.trial_end BETWEEN NOW() AND NOW() + (days_before || ' days')::INTERVAL
        AND NOT EXISTS (
            SELECT 1 FROM subscription_overrides so 
            WHERE so.user_id = s.user_id AND so.is_waived = true
        )
    ORDER BY s.trial_end ASC;
END;
$$ LANGUAGE plpgsql;

-- 8. Add READ COMMITTED isolation and row-level locking hints via comments
COMMENT ON TABLE subscriptions IS 'Main subscriptions table. Use SELECT ... FOR UPDATE when modifying subscription status to prevent race conditions.';
COMMENT ON TABLE subscription_overrides IS 'User-specific pricing overrides. Use row-level locks when applying/removing overrides.';

-- 9. Create index for connection pooling and concurrent access
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id 
ON subscriptions(stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer 
ON subscriptions(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- 10. Add statistics targets for better query planning
ALTER TABLE subscriptions ALTER COLUMN status SET STATISTICS 1000;
ALTER TABLE subscriptions ALTER COLUMN user_id SET STATISTICS 1000;

-- Run ANALYZE to update statistics
ANALYZE subscriptions;
ANALYZE subscription_plans;
ANALYZE subscription_overrides;
ANALYZE promo_codes;
