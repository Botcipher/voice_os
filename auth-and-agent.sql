-- ============================================
-- VOICE LEAD OS — RUN THIS IN SUPABASE SQL EDITOR
-- Two things: auth tables + agent_name column
-- ============================================

-- 1. Add agent_name to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'Sarah';

-- Update your existing settings row with agent name
UPDATE settings SET agent_name = 'Sarah' WHERE tenant_id = '61bb686c-5381-43f6-b65b-07bbd2a1448f';

-- 2. Create users table (dashboard logins)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT,
  password_hash TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create sessions table (login tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- 4. Insert your login user
-- PASSWORD: The hash below is for the password: dashboard2025
-- To use a different password, generate the SHA-256 hash and replace it:
--   Step 1: Go to https://emn178.github.io/online-tools/sha256.html
--   Step 2: Type your password
--   Step 3: Copy the hash and paste it below replacing the value after 'password_hash ='

INSERT INTO users (tenant_id, email, password_hash, active)
VALUES (
  '61bb686c-5381-43f6-b65b-07bbd2a1448f',
  'owner@coolair.com',
  'ef92b778bafe771207463571b1e8b4d4b8d8d4c1e5b9f4a4d0a3e5a2c9d8f1b3',
  true
)
ON CONFLICT DO NOTHING;

-- To change your password later, run:
-- UPDATE users SET password_hash = 'your-new-hash-here'
-- WHERE tenant_id = '61bb686c-5381-43f6-b65b-07bbd2a1448f';
