-- Cron jobs and automated trial management
-- These functions handle trial expiration and email reminders

-- 1. Function to check and expire trials (call from cron every hour)
CREATE OR REPLACE FUNCTION expire_trials()
RETURNS TABLE(expired_count INT) AS $$
DECLARE
    updated_count INT;
BEGIN
    -- Expire trials that have ended
    UPDATE subscriptions
    SET 
        status = 'canceled',
        canceled_at = NOW(),
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
            'trial_end', trial_end,
            'status', 'canceled'
        ),
        'system'
    FROM subscriptions
    WHERE 
        status = 'canceled' 
        AND updated_at > NOW() - INTERVAL '2 minutes';
    
    RETURN QUERY SELECT updated_count;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to send trial ending reminders (call from cron daily)
CREATE OR REPLACE FUNCTION get_trials_ending_soon(days_before INT DEFAULT 3)
RETURNS TABLE(
    user_id UUID,
    email VARCHAR,
    name VARCHAR,
    trial_end TIMESTAMP WITH TIME ZONE,
    days_remaining INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.user_id,
        u.email,
        u.name,
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

-- 3. Function to get subscription analytics
CREATE OR REPLACE FUNCTION get_subscription_analytics()
RETURNS TABLE(
    metric VARCHAR,
    value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    -- Active subscriptions
    SELECT 'active_subscriptions'::VARCHAR, COUNT(*)::NUMERIC
    FROM subscriptions
    WHERE status IN ('active', 'trialing')
    
    UNION ALL
    
    -- MRR (Monthly Recurring Revenue)
    SELECT 'mrr'::VARCHAR, COALESCE(SUM(
        CASE 
            WHEN so.is_waived THEN 0
            WHEN so.override_price IS NOT NULL THEN so.override_price
            ELSE sp.base_price
        END
    ), 0)::NUMERIC
    FROM subscriptions s
    LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN subscription_overrides so ON s.user_id = so.user_id
    WHERE s.status = 'active'
    
    UNION ALL
    
    -- Active trials
    SELECT 'active_trials'::VARCHAR, COUNT(*)::NUMERIC
    FROM subscriptions
    WHERE status = 'trialing' AND trial_end > NOW()
    
    UNION ALL
    
    -- Pending cancellations
    SELECT 'pending_cancellations'::VARCHAR, COUNT(*)::NUMERIC
    FROM subscriptions
    WHERE cancel_at_period_end = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_trials() IS 'Expires trials that have ended. Run hourly via cron.';
COMMENT ON FUNCTION get_trials_ending_soon(INT) IS 'Gets trials ending within specified days. Use for sending reminder emails.';
COMMENT ON FUNCTION get_subscription_analytics() IS 'Returns subscription analytics for admin dashboard.';
