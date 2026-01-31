-- Create provider_tokens table in Supabase
-- This table stores encrypted provider tokens using Supabase Vault

CREATE TABLE IF NOT EXISTS provider_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    token_data JSONB NOT NULL,  -- Encrypted by Supabase Vault
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_provider_tokens_user_id ON provider_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_tokens_provider ON provider_tokens(provider);

-- Enable Row Level Security (RLS)
ALTER TABLE provider_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own tokens
-- Note: This should be enforced by backend service role key in practice
CREATE POLICY "Users can access their own tokens"
    ON provider_tokens
    FOR ALL
    USING (auth.uid()::text = user_id::text);

-- Note: In production, you may want to use Supabase Vault for encryption
-- This is a simplified version - actual encryption should be handled by Supabase Vault
