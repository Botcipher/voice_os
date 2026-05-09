-- ============================================
-- VOICE LEAD OS — COMPLETE SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- Drop existing tables cleanly (order matters due to foreign keys)
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ─────────────────────────────────────────────
-- TENANTS
-- One row per client/business you onboard
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  industry TEXT,         -- hvac, plumbing, roofing etc
  phone_number TEXT,     -- their Retell phone number in E.164 format e.g. +14155551234
  email TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- SETTINGS
-- Per-tenant configuration — Sarah reads this on every call
-- ─────────────────────────────────────────────
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

  business_name TEXT DEFAULT 'My Business',
  business_email TEXT,
  business_phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  sender_email TEXT,

  slot_duration_minutes INTEGER DEFAULT 60,
  working_hours_start TEXT DEFAULT '08:00',
  working_hours_end TEXT DEFAULT '18:00',
  working_days TEXT[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],

  emergency_keywords TEXT[] DEFAULT ARRAY['no heat','no ac','no air','gas leak','flooding','not cooling','wont turn on','carbon monoxide'],
  emergency_callback_minutes INTEGER DEFAULT 30,

  calendar_id TEXT,
  notify_email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS
-- Dashboard login credentials — one per tenant
-- Password is stored as SHA-256 hash, never plaintext
-- To create a password hash:
--   Node: require('crypto').createHash('sha256').update('yourpassword').digest('hex')
--   Or use: https://emn178.github.io/online-tools/sha256.html
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT,
  password_hash TEXT NOT NULL,  -- SHA-256 hash of their password
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- SESSIONS
-- Active login tokens — auto-expire after 7 days
-- ─────────────────────────────────────────────
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────────
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,

  source TEXT DEFAULT 'call',
  status TEXT DEFAULT 'new',     -- new, contacted, qualified, booked, lost

  job_type TEXT,
  urgency TEXT DEFAULT 'normal', -- normal, emergency

  address TEXT,
  notes TEXT,

  assigned_to TEXT DEFAULT 'ai', -- ai, human
  last_contact_at TIMESTAMPTZ,
  last_message_type TEXT,

  do_not_contact BOOLEAN DEFAULT FALSE,
  active_conversation BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, phone)
);

-- ─────────────────────────────────────────────
-- CALLS
-- ─────────────────────────────────────────────
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  retell_call_id TEXT UNIQUE,

  call_status TEXT DEFAULT 'answered', -- answered, missed, failed
  duration_seconds INTEGER DEFAULT 0,

  transcript TEXT,
  summary TEXT,
  recording_url TEXT,

  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- APPOINTMENTS
-- ─────────────────────────────────────────────
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'booked', -- booked, rescheduled, cancelled, completed

  calendar_event_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────────
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────────
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  channel TEXT DEFAULT 'call',
  message TEXT,
  direction TEXT,
  message_type TEXT,
  status TEXT DEFAULT 'sent',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────────
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  channel TEXT DEFAULT 'sms',
  message_type TEXT,
  content TEXT,
  status TEXT DEFAULT 'pending',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_calls_lead_id ON calls(lead_id);
CREATE INDEX idx_calls_tenant_id ON calls(tenant_id);
CREATE INDEX idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX idx_events_lead_id ON events(lead_id);
CREATE INDEX idx_events_processed ON events(processed);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_settings_tenant_id ON settings(tenant_id);

-- ─────────────────────────────────────────────
-- SEED DATA
-- Your Cool Air HVAC tenant + settings + login user
-- ─────────────────────────────────────────────

-- Insert tenant with your existing tenant ID
INSERT INTO tenants (id, business_name, industry, phone_number, email, timezone)
VALUES (
  '61bb686c-5381-43f6-b65b-07bbd2a1448f',
  'Cool Air HVAC',
  'hvac',
  '+15550000000',
  'info@coolair.com',
  'America/New_York'
);

-- Insert settings
INSERT INTO settings (
  tenant_id, business_name, business_email, business_phone,
  timezone, slot_duration_minutes, working_hours_start, working_hours_end,
  working_days, emergency_keywords, emergency_callback_minutes,
  calendar_id, notify_email
) VALUES (
  '61bb686c-5381-43f6-b65b-07bbd2a1448f',
  'Cool Air HVAC',
  'info@coolair.com',
  '+15550000000',
  'America/New_York',
  60, '08:00', '18:00',
  ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
  ARRAY['no heat','no ac','no air','gas leak','flooding','not cooling','wont turn on','carbon monoxide'],
  30,
  'your-calendar-id@gmail.com',
  'owner@coolair.com'
);

-- Insert dashboard login user
-- Password below is SHA-256 hash of: hvac2025
-- To change password: hash your new password with SHA-256 and replace the hash below
-- Online tool: https://emn178.github.io/online-tools/sha256.html
INSERT INTO users (tenant_id, email, password_hash, active)
VALUES (
  '61bb686c-5381-43f6-b65b-07bbd2a1448f',
  'owner@coolair.com',
  'a6b8c25d8c16e1b52cbb9d6e7e3e1f2d4a8b9c0e1f2a3b4c5d6e7f8a9b0c1d2',
  true
);

-- NOTE: The hash above is a placeholder.
-- Generate your real password hash BEFORE running this SQL.
-- In Node.js: require('crypto').createHash('sha256').update('YourPassword').digest('hex')
