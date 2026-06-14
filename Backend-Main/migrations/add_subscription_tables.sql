-- Subscription System Tables Migration
-- This migration adds all tables needed for subscription management

-- 1. Create enum types for subscription status and billing cycles
CREATE TYPE subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'paused',
    'lifetime'
);

CREATE TYPE billing_cycle AS ENUM (
    'monthly',
    'yearly',
    'quarterly',
    'lifetime'
);

CREATE TYPE discount_type AS ENUM (
    'percentage',
    'fixed'
);

-- 2. Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    stripe_price_id VARCHAR(255),
    stripe_product_id VARCHAR(255),
    billing_cycle billing_cycle NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'usd' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    status subscription_status NOT NULL DEFAULT 'trialing',
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false NOT NULL,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_user_active_subscription UNIQUE (user_id)
);

-- 4. Subscription Overrides Table (for custom pricing per user)
CREATE TABLE IF NOT EXISTS subscription_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    override_price NUMERIC(10, 2),
    discount_percentage NUMERIC(5, 2) CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    discount_fixed NUMERIC(10, 2) CHECK (discount_fixed >= 0),
    is_waived BOOLEAN DEFAULT false NOT NULL,
    waive_reason TEXT,
    override_reason TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Promo Codes Table
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    stripe_coupon_id VARCHAR(255),
    discount_type discount_type NOT NULL,
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    max_redemptions INTEGER,
    redemptions_count INTEGER DEFAULT 0 NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true NOT NULL,
    applies_to_plan_ids JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT valid_redemptions CHECK (redemptions_count <= max_redemptions OR max_redemptions IS NULL),
    CONSTRAINT valid_dates CHECK (valid_until IS NULL OR valid_until > valid_from)
);

-- 6. Subscription History Table (audit log)
CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    performed_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    last4 VARCHAR(4),
    brand VARCHAR(50),
    exp_month INTEGER CHECK (exp_month >= 1 AND exp_month <= 12),
    exp_year INTEGER CHECK (exp_year >= 2024),
    is_default BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_trial_end ON subscriptions(trial_end);
CREATE INDEX idx_subscriptions_current_period_end ON subscriptions(current_period_end);

CREATE INDEX idx_subscription_overrides_user_id ON subscription_overrides(user_id);
CREATE INDEX idx_subscription_overrides_is_waived ON subscription_overrides(is_waived);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_is_active ON promo_codes(is_active);
CREATE INDEX idx_promo_codes_valid_until ON promo_codes(valid_until);

CREATE INDEX idx_subscription_history_subscription_id ON subscription_history(subscription_id);
CREATE INDEX idx_subscription_history_created_at ON subscription_history(created_at);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(is_default);

CREATE INDEX idx_subscription_plans_is_active ON subscription_plans(is_active);
CREATE INDEX idx_subscription_plans_billing_cycle ON subscription_plans(billing_cycle);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_overrides_updated_at BEFORE UPDATE ON subscription_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription plan
INSERT INTO subscription_plans (name, billing_cycle, base_price, currency, is_active, features)
VALUES 
    ('Pro Monthly', 'monthly', 29.99, 'usd', true, '{"accounts": "unlimited", "refresh": "real-time", "support": "priority"}'),
    ('Pro Yearly', 'yearly', 299.99, 'usd', true, '{"accounts": "unlimited", "refresh": "real-time", "support": "priority", "discount": "2 months free"}')
ON CONFLICT DO NOTHING;

-- Add comments to tables for documentation
COMMENT ON TABLE subscription_plans IS 'Available subscription plans with pricing';
COMMENT ON TABLE subscriptions IS 'User subscriptions tracking trial and paid status';
COMMENT ON TABLE subscription_overrides IS 'Custom pricing and discounts per user';
COMMENT ON TABLE promo_codes IS 'Promotional codes for discounts';
COMMENT ON TABLE subscription_history IS 'Audit log of all subscription changes';
COMMENT ON TABLE payment_methods IS 'User payment methods stored in Stripe';
