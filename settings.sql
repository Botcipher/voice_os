-- ============================================
-- SETTINGS TABLE — Run in Supabase SQL Editor
-- ============================================

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

  -- Business Info
  business_name TEXT DEFAULT 'Cool Air HVAC',
  business_email TEXT,
  business_phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  sender_email TEXT,

  -- Appointment Config
  slot_duration_minutes INTEGER DEFAULT 60,
  working_hours_start TEXT DEFAULT '08:00',
  working_hours_end TEXT DEFAULT '18:00',
  working_days TEXT[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],

  -- Emergency Config
  emergency_keywords TEXT[] DEFAULT ARRAY['no heat','no ac','no air','gas leak','flooding','not cooling','wont turn on','carbon monoxide'],
  emergency_callback_minutes INTEGER DEFAULT 30,

  -- Integrations
  calendar_id TEXT,
  notify_email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings for the test tenant
INSERT INTO settings (
  tenant_id,
  business_name,
  business_email,
  business_phone,
  timezone,
  sender_email,
  slot_duration_minutes,
  working_hours_start,
  working_hours_end,
  working_days,
  emergency_keywords,
  emergency_callback_minutes,
  calendar_id,
  notify_email
) VALUES (
  '61bb686c-5381-43f6-b65b-07bbd2a1448f',
  'Cool Air HVAC',
  'info@coolair.com',
  '+15550000000',
  'America/New_York',
  'noreply@coolair.com',
  60,
  '08:00',
  '18:00',
  ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
  ARRAY['no heat','no ac','no air','gas leak','flooding','not cooling','wont turn on','carbon monoxide'],
  30,
  'your-google-calendar-id@gmail.com',
  'owner@coolair.com'
);

CREATE INDEX idx_settings_tenant_id ON settings(tenant_id);
