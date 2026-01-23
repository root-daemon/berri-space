-- Migration: Create users table
-- Description: Persistent user records that map Clerk users to database users

-- Create users table
-- Using gen_random_uuid() which is built into PostgreSQL and works in Supabase
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on clerk_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);

-- Create index on email for potential email-based queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create a function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at on row update
DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE users IS 'Persistent user records mapping Clerk auth users to database users';
COMMENT ON COLUMN users.clerk_user_id IS 'Unique identifier from Clerk authentication';
COMMENT ON COLUMN users.email IS 'User email from Clerk (synced on each auth)';
COMMENT ON COLUMN users.name IS 'User display name from Clerk (synced on each auth)';