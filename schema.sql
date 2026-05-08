-- ============================================
-- VOICE LEAD OS — SUPABASE SCHEMA (FIXED)
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- Drop existing tables cleanly (order matters due to foreign keys)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ─────────────────────────────────────────────
-- TENANTS
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  industry TEXT, -- hvac, plumbing, electrical
  phone_number TEXT,
  email TEXT,
  timezone TEXT DEFAULT 'UTC',
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

  source TEXT DEFAULT 'call', -- call, form, sms
  status TEXT DEFAULT 'new',  -- new, contacted, qualified, booked, lost

  job_type TEXT,              -- repair, install, maintenance
  urgency TEXT DEFAULT 'normal', -- emergency, normal

  address TEXT,
  notes TEXT,

  assigned_to TEXT DEFAULT 'ai', -- ai, human
  last_contact_at TIMESTAMPTZ,
  last_message_type TEXT,

  do_not_contact BOOLEAN DEFAULT FALSE,
  active_conversation BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate leads per tenant
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
-- EVENTS (the brain)
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
-- CONVERSATIONS (call logs + future SMS)
-- ─────────────────────────────────────────────
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  channel TEXT DEFAULT 'call',     -- call, sms, email
  message TEXT,
  direction TEXT,                   -- inbound, outbound

  message_type TEXT,                -- confirmation, follow_up, reminder
  status TEXT DEFAULT 'sent',       -- sent, delivered, failed

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- MESSAGES (future SMS — ready now)
-- ─────────────────────────────────────────────
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  channel TEXT DEFAULT 'sms',       -- sms, email
  message_type TEXT,

  content TEXT,
  status TEXT DEFAULT 'pending',    -- pending, sent, failed

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES (for query performance)
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

-- ─────────────────────────────────────────────
-- SEED: Insert a test tenant to get started
-- ─────────────────────────────────────────────
INSERT INTO tenants (business_name, industry, phone_number, email, timezone)
VALUES ('Test HVAC Co', 'hvac', '+15550000000', 'test@testhvac.com', 'America/New_York')

