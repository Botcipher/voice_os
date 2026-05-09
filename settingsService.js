const supabase = require('./supabase');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Strict UUID v4 validator
function isUUID(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Safe defaults if no settings row exists yet
function getDefaults(tenantId = null) {
  return {
    tenant_id: tenantId,
    business_name: 'Cool Air HVAC',
    agent_name: 'Sarah',
    business_email: '',
    business_phone: '',
    timezone: 'America/New_York',
    sender_email: '',
    slot_duration_minutes: 60,
    working_hours_start: '08:00',
    working_hours_end: '18:00',
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    emergency_keywords: [
      'no heat', 'no ac', 'no air', 'gas leak',
      'flooding', 'not cooling', 'wont turn on', 'carbon monoxide'
    ],
    emergency_callback_minutes: 30,
    calendar_id: '',
    notify_email: '',
  };
}

// ─────────────────────────────────────────────
// GET SETTINGS
// ─────────────────────────────────────────────

async function getSettings(tenantId) {
  try {
    // 🔥 HARD GUARD — NEVER hit DB with invalid UUID
    if (!isUUID(tenantId)) {
      console.warn('[getSettings] Invalid tenant_id:', tenantId);
      return getDefaults(null);
    }

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(); // safer than .single()

    if (error) {
      console.error('[getSettings] Supabase error:', error.message);
      throw error;
    }

    if (!data) {
      return getDefaults(tenantId);
    }

    return data;

  } catch (err) {
    console.error('[getSettings] Fatal error:', err.message);
    return getDefaults(null); // fail-safe fallback
  }
}

// ─────────────────────────────────────────────
// UPDATE SETTINGS
// ─────────────────────────────────────────────

async function updateSettings(tenantId, updates) {
  try {
    // 🔥 HARD GUARD
    if (!isUUID(tenantId)) {
      console.warn('[updateSettings] Invalid tenant_id:', tenantId);
      throw new Error('Invalid tenant_id');
    }

    const allowed = [
      'business_name', 'agent_name', 'business_email', 'business_phone', 'timezone',
      'sender_email', 'slot_duration_minutes', 'working_hours_start',
      'working_hours_end', 'working_days', 'emergency_keywords',
      'emergency_callback_minutes', 'calendar_id', 'notify_email'
    ];

    const safe = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safe[key] = updates[key];
    }

    safe.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('settings')
      .upsert(
        { tenant_id: tenantId, ...safe },
        { onConflict: 'tenant_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error('[updateSettings] Supabase error:', error.message);
      throw error;
    }

    return data;

  } catch (err) {
    console.error('[updateSettings] Fatal error:', err.message);
    throw err;
  }
}

module.exports = { getSettings, updateSettings };
