const supabase = require('./supabase');

// Get settings for a tenant — used by n8n at start of every workflow
async function getSettings(tenantId) {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  // If no settings exist yet, return safe defaults
  if (!data) {
    return getDefaults(tenantId);
  }

  return data;
}

// Update settings — called from dashboard
async function updateSettings(tenantId, updates) {
  const allowed = [
    'business_name', 'business_email', 'business_phone', 'timezone',
    'sender_email', 'slot_duration_minutes', 'working_hours_start',
    'working_hours_end', 'working_days', 'emergency_keywords',
    'emergency_callback_minutes', 'calendar_id', 'notify_email'
  ];

  // Strip any fields that aren't allowed
  const safe = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safe[key] = updates[key];
  }

  safe.updated_at = new Date().toISOString();

  // Upsert — create if doesn't exist, update if it does
  const { data, error } = await supabase
    .from('settings')
    .upsert({ tenant_id: tenantId, ...safe }, { onConflict: 'tenant_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Safe defaults if no settings row exists yet
function getDefaults(tenantId) {
  return {
    tenant_id: tenantId,
    business_name: 'Cool Air HVAC',
    business_email: '',
    business_phone: '',
    timezone: 'America/New_York',
    sender_email: '',
    slot_duration_minutes: 60,
    working_hours_start: '08:00',
    working_hours_end: '18:00',
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    emergency_keywords: ['no heat', 'no ac', 'no air', 'gas leak', 'flooding', 'not cooling', 'wont turn on', 'carbon monoxide'],
    emergency_callback_minutes: 30,
    calendar_id: '',
    notify_email: '',
  };
}

module.exports = { getSettings, updateSettings };
