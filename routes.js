const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { upsertLead, updateLeadStatus, assignToHuman } = require('./leadService');
const { saveCall, getCallByRetellId } = require('./callService');
const { getUpcomingAppointments, updateAppointmentStatus, getAppointmentByLead } = require('./appointmentService');
const { createEvent } = require('./eventEngine');
const { getSettings, updateSettings } = require('./settingsService');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const { requireAuth } = require('./middleware');

// Returns true only if value is a valid UUID v4 string.
// Used to guard :id and :tenant_id params so a Next.js prefetch file
// like "index.txt" can never reach Supabase and cause a type error.
function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

// Fallback tenant ID used for web call testing only.
// Web calls have no phone number so we cannot look up the tenant automatically.
// For real inbound phone calls this is never used — the lookup happens by to_number.
// To add a new client: add a new row to the tenants table with their phone number.
// Their tenant_id will be used automatically when their number is called.
const WEB_CALL_TEST_TENANT_ID = '61bb686c-5381-43f6-b65b-07bbd2a1448f';

// ─────────────────────────────────────────────
// HELPER — look up tenant + settings by phone number
// Used by call_started for real inbound phone calls
// ─────────────────────────────────────────────
async function getTenantByPhone(phoneNumber) {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  if (error || !tenant) return null;

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single();

  return { tenant, settings: settings || {} };
}

// ─────────────────────────────────────────────
// HELPER — look up tenant + settings by tenant ID directly
// Used for web calls where we cannot look up by phone number
// ─────────────────────────────────────────────
async function getTenantById(tenantId) {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !tenant) return null;

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single();

  return { tenant, settings: settings || {} };
}

// ─────────────────────────────────────────────
// HELPER — format working hours into readable string for agent
// ─────────────────────────────────────────────
function formatWorkingHours(s) {
  const days = Array.isArray(s.working_days) && s.working_days.length > 0
    ? s.working_days.join(', ')
    : 'Monday to Friday';
  return s.working_hours_start && s.working_hours_end
    ? `${days} ${s.working_hours_start} to ${s.working_hours_end}`
    : 'Monday to Friday 8AM to 6PM';
}

// ─────────────────────────────────────────────
// RETELL WEBHOOK — single endpoint, handles all events
//
// call_started    → look up tenant, patch dynamic variables
//                   into the live call before agent speaks
//
//                   For PHONE calls: lookup by to_number
//                   For WEB calls:   lookup by tenant_id in metadata,
//                                    or fall back to WEB_CALL_TEST_TENANT_ID
//
// call_ended      → save call record, upsert lead, fire events
// call_analyzed   → same as call_ended but deduplicated
// everything else → acknowledge with 204
//
// Webhook URL to set in Retell agent settings:
//   https://voice-os-0er9.onrender.com/webhooks/retell
//
// Webhook events to enable in Retell:
//   call_started, call_ended, call_analyzed
// ─────────────────────────────────────────────

router.post('/webhooks/retell', async (req, res) => {
  const body = req.body;
  const event = body.event;
  const call = body.call || {};

  console.log(`[Webhook] Event: ${event} | Call ID: ${call.call_id} | Type: ${call.call_type}`);

  // ── CALL STARTED — inject dynamic variables into the live call
  if (event === 'call_started') {
    let result = null;
    const toNumber = call.to_number;
    const isWebCall = call.call_type === 'web_call' || !toNumber;

    if (!isWebCall) {
      // Real phone call — look up tenant by the number that was called
      console.log('[call_started] Phone call — looking up tenant by number:', toNumber);
      result = await getTenantByPhone(toNumber);
    } else {
      // Web call — check if tenant_id was passed in metadata first
      const metaTenantId = call.metadata?.tenant_id;

      if (metaTenantId) {
        console.log('[call_started] Web call — using tenant_id from metadata:', metaTenantId);
        result = await getTenantById(metaTenantId);
      } else {
        // Fall back to test tenant ID for dashboard/browser testing
        console.log('[call_started] Web call — no metadata tenant_id, using test tenant:', WEB_CALL_TEST_TENANT_ID);
        result = await getTenantById(WEB_CALL_TEST_TENANT_ID);
      }
    }

    if (!result) {
      console.warn('[call_started] No tenant found — call continues without variables');
      return res.status(204).send();
    }

    const { tenant, settings: s } = result;

    const dynamicVariables = {
      tenant_id: tenant.id,
      business_name: s.business_name || tenant.business_name || 'our company',
      working_hours: formatWorkingHours(s),
      emergency_callback_minutes: s.emergency_callback_minutes || 30,
    };

    console.log('[call_started] Injecting variables for tenant:', tenant.id, dynamicVariables);

    // Patch the live call with dynamic variables via Retell API
    try {
      const patchRes = await fetch(`https://api.retellai.com/v2/call/${call.call_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ retell_llm_dynamic_variables: dynamicVariables }),
      });

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        console.error('[call_started] Retell PATCH failed:', errText);
      } else {
        console.log('[call_started] Variables injected successfully for:', dynamicVariables.business_name);
      }
    } catch (err) {
      console.error('[call_started] Network error patching call:', err.message);
    }

    return res.status(204).send();
  }

  // ── CALL ENDED / CALL ANALYZED — save data, upsert lead, fire events
  if (event === 'call_ended' || event === 'call_analyzed') {

    // tenant_id was injected as a dynamic variable at call_started
    const tenantId = call.retell_llm_dynamic_variables?.tenant_id
      || call.metadata?.tenant_id
      || null;

    if (!tenantId || tenantId === 'unknown') {
      console.error(`[${event}] Missing tenant_id — skipping`);
      return res.status(204).send();
    }

    const phone = call.from_number || null;

    if (!phone) {
      console.error(`[${event}] Missing from_number — skipping`);
      return res.status(204).send();
    }

    // Guard against duplicate processing between call_ended and call_analyzed
    const retellCallId = call.call_id || null;
    if (retellCallId) {
      const existing = await getCallByRetellId(retellCallId);
      if (existing) {
        console.log(`[${event}] Duplicate — call ${retellCallId} already processed`);
        return res.status(204).send();
      }
    }

    // Extract all call data
    const name = call.retell_llm_dynamic_variables?.caller_name
      || call.metadata?.caller_name
      || null;
    const email = call.metadata?.caller_email || null;
    const jobType = call.call_analysis?.custom_analysis_data?.job_type
      || call.metadata?.job_type
      || null;
    const urgency = call.call_analysis?.custom_analysis_data?.urgency
      || call.metadata?.urgency
      || 'normal';
    const address = call.call_analysis?.custom_analysis_data?.address
      || call.metadata?.address
      || null;
    const notes = call.call_analysis?.custom_analysis_data?.notes
      || call.metadata?.notes
      || null;
    const bookingMade = call.call_analysis?.custom_analysis_data?.booking_made
      || call.metadata?.booking_made
      || false;
    const scheduledAt = call.call_analysis?.custom_analysis_data?.scheduled_at
      || call.metadata?.scheduled_at
      || null;
    const callStatus = call.call_status || 'answered';
    const durationSeconds = call.duration_ms
      ? Math.round(call.duration_ms / 1000)
      : call.duration_seconds || 0;
    const transcript = call.transcript || null;
    const summary = call.call_analysis?.call_summary || null;
    const recordingUrl = call.recording_url || null;
    const startedAt = call.start_timestamp
      ? new Date(call.start_timestamp).toISOString()
      : new Date().toISOString();
    const endedAt = call.end_timestamp
      ? new Date(call.end_timestamp).toISOString()
      : new Date().toISOString();

    // Upsert the lead
    const { lead } = await upsertLead(tenantId, {
      phone,
      name,
      email,
      jobType,
      urgency,
      address,
      notes,
      source: 'call',
    });

    // Save the call record
    await saveCall(tenantId, lead.id, {
      retell_call_id: retellCallId,
      call_status: callStatus,
      duration_seconds: durationSeconds,
      transcript,
      summary,
      recording_url: recordingUrl,
      started_at: startedAt,
      ended_at: endedAt,
    });

    // Fire the right downstream event
    if (callStatus === 'failed' || callStatus === 'missed') {
      await createEvent(tenantId, lead.id, 'call_failed', { call_status: callStatus });
    } else if (bookingMade && scheduledAt) {
      await createEvent(tenantId, lead.id, 'appointment_booked', { scheduled_at: scheduledAt, lead });
    } else {
      await createEvent(tenantId, lead.id, 'call_completed', {});
      await createEvent(tenantId, lead.id, 'no_booking_after_call', {});
    }

    console.log(`[${event}] Done — tenant: ${tenantId} | lead: ${lead.id}`);
    return res.status(204).send();
  }

  // ── ALL OTHER EVENTS — acknowledge and move on
  console.log(`[Webhook] Event ${event} acknowledged — no action taken`);
  return res.status(204).send();
});

// ─────────────────────────────────────────────
// DASHBOARD API
// ─────────────────────────────────────────────

// GET /dashboard/overview?tenant_id=xxx
router.get('/dashboard/overview', requireAuth, async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [callsToday, leadsTotal, leadsBooked, leadsNew] = await Promise.all([
    supabase.from('calls').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).gte('created_at', today.toISOString()),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).eq('status', 'booked'),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).eq('status', 'new'),
  ]);

  const totalLeads = leadsTotal.count || 0;
  const bookedLeads = leadsBooked.count || 0;
  const conversionRate = totalLeads > 0
    ? ((bookedLeads / totalLeads) * 100).toFixed(1)
    : '0.0';

  return res.json({
    calls_today: callsToday.count || 0,
    total_leads: totalLeads,
    leads_booked: bookedLeads,
    leads_new: leadsNew.count || 0,
    conversion_rate: `${conversionRate}%`,
  });
});

// GET /dashboard/leads?tenant_id=xxx&status=xxx&page=1
router.get('/dashboard/leads', requireAuth, async (req, res) => {
  const { tenant_id, status, page = 1 } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) throw error;

  return res.json({ leads: data, total: count, page: parseInt(page) });
});

// GET /dashboard/leads/:id — single lead with calls and appointments
router.get('/dashboard/leads/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) return res.status(400).json({ error: 'Invalid lead id' });

  const [lead, calls, appointment] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('calls').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    getAppointmentByLead(id),
  ]);

  if (lead.error) return res.status(404).json({ error: 'Lead not found' });

  return res.json({
    lead: lead.data,
    calls: calls.data || [],
    appointment: appointment || null,
  });
});

// GET /dashboard/appointments?tenant_id=xxx
router.get('/dashboard/appointments', requireAuth, async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const appointments = await getUpcomingAppointments(tenant_id);
  return res.json({ appointments });
});

// PATCH /dashboard/appointments/:id — update status
router.patch('/dashboard/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, calendar_event_id } = req.body;

  if (!status) return res.status(400).json({ error: 'Missing status' });

  const updated = await updateAppointmentStatus(id, status, calendar_event_id);
  return res.json({ appointment: updated });
});

// PATCH /dashboard/leads/:id/assign-human
router.patch('/dashboard/leads/:id/assign-human', requireAuth, async (req, res) => {
  const { id } = req.params;
  const updated = await assignToHuman(id);
  return res.json({ lead: updated });
});

// GET /dashboard/conversations?tenant_id=xxx&lead_id=xxx
router.get('/dashboard/conversations', requireAuth, async (req, res) => {
  const { tenant_id, lead_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (lead_id) query = query.eq('lead_id', lead_id);

  const { data, error } = await query;
  if (error) throw error;

  return res.json({ conversations: data });
});

// GET /dashboard/calls?tenant_id=xxx
// Returns calls grouped by lead: [{ lead: {...}, calls: [...] }]
router.get('/dashboard/calls', requireAuth, async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const { data: calls, error } = await supabase
    .from('calls')
    .select('*, leads(*)')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const leadsMap = new Map();
  for (const call of calls) {
    const leadId = call.lead_id;
    if (!leadsMap.has(leadId)) {
      leadsMap.set(leadId, { lead: call.leads, calls: [] });
    }
    const { leads: _leads, ...callRow } = call;
    leadsMap.get(leadId).calls.push(callRow);
  }

  return res.json({ calls: Array.from(leadsMap.values()) });
});

// ─────────────────────────────────────────────
// SETTINGS API
// ─────────────────────────────────────────────

// GET /settings/:tenant_id
// Intentionally NOT auth-protected — also consumed by n8n workflows.
// UUID guard prevents Next.js prefetch files (e.g. "index.txt") from
// reaching Supabase and causing a type error.
router.get('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  if (!isUUID(tenant_id)) return res.status(400).json({ error: 'Invalid tenant_id' });
  const settings = await getSettings(tenant_id);
  return res.json(settings);
});

// PUT /settings/:tenant_id — dashboard only, requires auth
router.put('/settings/:tenant_id', requireAuth, async (req, res) => {
  const { tenant_id } = req.params;
  if (!isUUID(tenant_id)) return res.status(400).json({ error: 'Invalid tenant_id' });
  const updated = await updateSettings(tenant_id, req.body);
  return res.json({ settings: updated });
});

module.exports = router;
