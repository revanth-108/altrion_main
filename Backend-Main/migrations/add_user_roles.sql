-- Add role column to users table for admin management
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Create index on role for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Update existing admin users (replace with your email)
UPDATE users 
SET role = 'admin' 
WHERE email IN ('revanthshada@example.com', 'admin@altrion.com');

COMMENT ON COLUMN users.role IS 'User role: user, admin, super_admin';
