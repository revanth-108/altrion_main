-- Add provider-agnostic billing columns while keeping legacy Stripe columns.
-- This migration is backward-compatible and can be applied before the code
-- fully switches away from Stripe-specific identifiers.

ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS gateway VARCHAR(50),
ADD COLUMN IF NOT EXISTS gateway_plan_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gateway_product_id VARCHAR(255);

UPDATE public.subscription_plans
SET
  gateway = COALESCE(gateway, 'stripe'),
  gateway_plan_id = COALESCE(gateway_plan_id, stripe_price_id),
  gateway_product_id = COALESCE(gateway_product_id, stripe_product_id);

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS gateway_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gateway_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gateway_payment_profile_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gateway_checkout_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gateway_last_event_id VARCHAR(255);

UPDATE public.subscriptions
SET
  gateway_customer_id = COALESCE(gateway_customer_id, stripe_customer_id),
  gateway_subscription_id = COALESCE(gateway_subscription_id, stripe_subscription_id);

ALTER TABLE public.payment_methods
ADD COLUMN IF NOT EXISTS gateway_payment_method_id VARCHAR(255);

UPDATE public.payment_methods
SET gateway_payment_method_id = COALESCE(gateway_payment_method_id, stripe_payment_method_id);

ALTER TABLE public.promo_codes
ADD COLUMN IF NOT EXISTS gateway_coupon_id VARCHAR(255);

UPDATE public.promo_codes
SET gateway_coupon_id = COALESCE(gateway_coupon_id, stripe_coupon_id);
