CREATE TABLE IF NOT EXISTS public.payment_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL UNIQUE,
    gateway VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    payload JSONB,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_event_log_gateway ON public.payment_event_log(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_event_log_subscription_id ON public.payment_event_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_event_log_user_id ON public.payment_event_log(user_id);
