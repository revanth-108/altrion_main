-- BofA/CyberSource Secure Acceptance payment transaction log
-- Run after add_subscription_tables.sql

CREATE TABLE IF NOT EXISTS bofa_payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    reference_number VARCHAR(255) NOT NULL,
    transaction_uuid VARCHAR(255),
    transaction_id VARCHAR(255),
    decision VARCHAR(20) NOT NULL,
    reason_code VARCHAR(10),
    auth_code VARCHAR(50),
    amount NUMERIC(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    req_card_type VARCHAR(50),
    req_card_number VARCHAR(20),
    req_bill_to_email VARCHAR(255),
    req_bill_to_forename VARCHAR(100),
    req_bill_to_surname VARCHAR(100),
    req_bill_to_address_line1 VARCHAR(255),
    req_bill_to_address_city VARCHAR(100),
    req_bill_to_address_state VARCHAR(50),
    req_bill_to_address_postal_code VARCHAR(20),
    req_bill_to_address_country VARCHAR(10),
    payment_token VARCHAR(255),
    avs_code VARCHAR(10),
    cvn_code VARCHAR(10),
    raw_response JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_bofa_txn_user_id ON bofa_payment_transactions(user_id);
CREATE INDEX idx_bofa_txn_subscription_id ON bofa_payment_transactions(subscription_id);
CREATE INDEX idx_bofa_txn_reference_number ON bofa_payment_transactions(reference_number);
CREATE INDEX idx_bofa_txn_decision ON bofa_payment_transactions(decision);
CREATE INDEX idx_bofa_txn_created_at ON bofa_payment_transactions(created_at);

COMMENT ON TABLE bofa_payment_transactions IS 'Audit log of every BofA Secure Acceptance payment result';
