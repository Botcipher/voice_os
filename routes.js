const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { upsertLead, updateLeadStatus, assignToHuman } = require('./leadService');
const { saveCall, getCallByRetellId } = require('./callService');
const { getUpcomingAppointments, updateAppointmentStatus, getAppointmentByLead } = require('./appointmentService');
const { createEvent } = require('./eventEngine');
const { getSettings, updateSettings } = require('./settingsService');

// ─────────────────────────────────────────────
// HELPER — look up tenant + settings by phone number
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
// call_started    → look up tenant by to_number, patch dynamic
//                   variables back to Retell before agent speaks
// call_ended      → save call record, upsert lead, fire events
// call_analyzed   → same as call_ended but deduplicated — saves
//                   transcript + summary if not already saved
// everything else → just acknowledge with 204
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

  console.log(`[Webhook] Event: ${event} | Call ID: ${call.call_id}`);

  // ── CALL STARTED — inject dynamic variables into the live call
  if (event === 'call_started') {
    const toNumber = call.to_number;

    if (!toNumber) {
      console.error('[call_started] Missing to_number — cannot look up tenant');
      return res.status(204).send();
    }

    const result = await getTenantByPhone(toNumber);

    if (!result) {
      console.warn('[call_started] No tenant found for number:', toNumber, '— call continues without variables');
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
        console.log('[call_started] Variables injected successfully');
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
router.get('/dashboard/overview', async (req, res) => {
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
router.get('/dashboard/leads', async (req, res) => {
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
router.get('/dashboard/leads/:id', async (req, res) => {
  const { id } = req.params;

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
router.get('/dashboard/appointments', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const appointments = await getUpcomingAppointments(tenant_id);
  return res.json({ appointments });
});

// PATCH /dashboard/appointments/:id — update status
router.patch('/dashboard/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { status, calendar_event_id } = req.body;

  if (!status) return res.status(400).json({ error: 'Missing status' });

  const updated = await updateAppointmentStatus(id, status, calendar_event_id);
  return res.json({ appointment: updated });
});

// PATCH /dashboard/leads/:id/assign-human
router.patch('/dashboard/leads/:id/assign-human', async (req, res) => {
  const { id } = req.params;
  const updated = await assignToHuman(id);
  return res.json({ lead: updated });
});

// GET /dashboard/conversations?tenant_id=xxx&lead_id=xxx
router.get('/dashboard/conversations', async (req, res) => {
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

// ─────────────────────────────────────────────
// SETTINGS API
// ─────────────────────────────────────────────

// GET /settings/:tenant_id
router.get('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const settings = await getSettings(tenant_id);
  return res.json(settings);
});

// PUT /settings/:tenant_id
router.put('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const updated = await updateSettings(tenant_id, req.body);
  return res.json({ settings: updated });
});

module.exports = router;
  if (tenantError || !tenant) {
    console.error('[Register] No tenant found for number:', to_number);
    // Return safe fallback so the call still connects rather than failing silently
    return res.json({
      retell_llm_dynamic_variables: {
        tenant_id: 'unknown',
        business_name: 'our company',
        working_hours: 'Monday to Friday 8AM to 6PM',
        emergency_callback_minutes: 30,
      }
    });
  }

  // Pull their settings from Supabase
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single();

  const s = settings || {};

  // Format working hours into a readable string for the agent
  const days = Array.isArray(s.working_days) && s.working_days.length > 0
    ? s.working_days.join(', ')
    : 'Monday to Friday';

  const workingHours = s.working_hours_start && s.working_hours_end
    ? `${days} ${s.working_hours_start} to ${s.working_hours_end}`
    : 'Monday to Friday 8AM to 6PM';

  const dynamicVariables = {
    tenant_id: tenant.id,
    business_name: s.business_name || tenant.business_name || 'our company',
    working_hours: workingHours,
    emergency_callback_minutes: s.emergency_callback_minutes || 30,
  };

  console.log('[Register] Returning variables for tenant:', tenant.id, dynamicVariables);

  return res.json({
    retell_llm_dynamic_variables: dynamicVariables
  });
});

// ─────────────────────────────────────────────
// RETELL POST-CALL WEBHOOK
// Retell fires this after every call ends.
// We save the call, upsert the lead, and fire events.
// ─────────────────────────────────────────────

// POST /webhooks/retell
router.post('/webhooks/retell', async (req, res) => {
  const body = req.body;

  console.log('[Webhook] Retell payload received:', JSON.stringify(body, null, 2));

  // ── 1. Extract and normalize data from Retell payload
  // tenant_id comes from the dynamic variables we injected at call start
  const tenantId = body.retell_llm_dynamic_variables?.tenant_id
    || body.metadata?.tenant_id
    || body.tenant_id;

  if (!tenantId || tenantId === 'unknown') {
    console.error('[Webhook] Missing or unknown tenant_id — skipping');
    return res.status(400).json({ error: 'Missing tenant_id in payload' });
  }

  const phone = body.from_number || body.caller_number || body.metadata?.caller_number;
  const name = body.retell_llm_dynamic_variables?.caller_name
    || body.metadata?.caller_name
    || body.caller_name
    || null;
  const email = body.metadata?.caller_email || null;
  const jobType = body.call_analysis?.custom_analysis_data?.job_type
    || body.metadata?.job_type
    || null;
  const urgency = body.call_analysis?.custom_analysis_data?.urgency
    || body.metadata?.urgency
    || 'normal';
  const address = body.call_analysis?.custom_analysis_data?.address
    || body.metadata?.address
    || null;
  const notes = body.call_analysis?.custom_analysis_data?.notes
    || body.metadata?.notes
    || null;

  const retellCallId = body.call_id || body.retell_call_id;
  const callStatus = body.call_status || 'answered';
  const durationSeconds = body.duration_ms
    ? Math.round(body.duration_ms / 1000)
    : body.duration_seconds || 0;
  const transcript = body.transcript || null;
  const summary = body.call_analysis?.call_summary || body.summary || null;
  const recordingUrl = body.recording_url || null;
  const startedAt = body.start_timestamp
    ? new Date(body.start_timestamp).toISOString()
    : new Date().toISOString();
  const endedAt = body.end_timestamp
    ? new Date(body.end_timestamp).toISOString()
    : new Date().toISOString();

  const bookingMade = body.call_analysis?.custom_analysis_data?.booking_made
    || body.metadata?.booking_made
    || false;
  const scheduledAt = body.call_analysis?.custom_analysis_data?.scheduled_at
    || body.metadata?.scheduled_at
    || null;

  if (!phone) {
    return res.status(400).json({ error: 'Missing phone number in payload' });
  }

  // ── 2. Guard against duplicate webhook calls
  if (retellCallId) {
    const existing = await getCallByRetellId(retellCallId);
    if (existing) {
      console.log(`[Webhook] Duplicate call ${retellCallId} — skipping`);
      return res.status(200).json({ message: 'Duplicate call ignored' });
    }
  }

  // ── 3. Upsert lead
  const { lead } = await upsertLead(tenantId, {
    phone,
    name,
    email,
    jobType,
    urgency,
    address,
    notes,
    source: 'call'
  });

  // ── 4. Save call record
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

  // ── 5. Fire the right event
  if (callStatus === 'failed' || callStatus === 'missed') {
    await createEvent(tenantId, lead.id, 'call_failed', { call_status: callStatus });
  } else if (bookingMade && scheduledAt) {
    await createEvent(tenantId, lead.id, 'appointment_booked', { scheduled_at: scheduledAt, lead });
  } else {
    await createEvent(tenantId, lead.id, 'call_completed', {});
    await createEvent(tenantId, lead.id, 'no_booking_after_call', {});
  }

  return res.status(200).json({ success: true, lead_id: lead.id });
});

// ─────────────────────────────────────────────
// DASHBOARD API
// ─────────────────────────────────────────────

// GET /dashboard/overview?tenant_id=xxx
router.get('/dashboard/overview', async (req, res) => {
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
router.get('/dashboard/leads', async (req, res) => {
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
router.get('/dashboard/leads/:id', async (req, res) => {
  const { id } = req.params;

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
router.get('/dashboard/appointments', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const appointments = await getUpcomingAppointments(tenant_id);
  return res.json({ appointments });
});

// PATCH /dashboard/appointments/:id — update status (reschedule / cancel)
router.patch('/dashboard/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { status, calendar_event_id } = req.body;

  if (!status) return res.status(400).json({ error: 'Missing status' });

  const updated = await updateAppointmentStatus(id, status, calendar_event_id);
  return res.json({ appointment: updated });
});

// PATCH /dashboard/leads/:id/assign-human — stop AI, hand to human
router.patch('/dashboard/leads/:id/assign-human', async (req, res) => {
  const { id } = req.params;
  const updated = await assignToHuman(id);
  return res.json({ lead: updated });
});

// GET /dashboard/conversations?tenant_id=xxx&lead_id=xxx
router.get('/dashboard/conversations', async (req, res) => {
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

// ─────────────────────────────────────────────
// SETTINGS API — used by n8n + dashboard
// ─────────────────────────────────────────────

// GET /settings/:tenant_id — n8n calls this at start of every workflow
router.get('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const settings = await getSettings(tenant_id);
  return res.json(settings);
});

// PUT /settings/:tenant_id — dashboard calls this to update settings
router.put('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const updated = await updateSettings(tenant_id, req.body);
  return res.json({ settings: updated });
});

module.exports = router;

  if (!calledNumber) {
    console.warn('[Inbound] No called number found — returning defaults');
    return res.json(safeDefaults);
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, business_name, phone_number')
    .eq('phone_number', calledNumber)
    .single();

  if (tenantError || !tenant) {
    console.warn('[Inbound] No tenant found for number:', calledNumber, '— returning defaults');
    return res.json(safeDefaults);
  }

  console.log('[Inbound] Tenant matched:', tenant.business_name, '| ID:', tenant.id);

  const settings = await getSettings(tenant.id);

  const workingDays = Array.isArray(settings.working_days)
    ? settings.working_days.join(', ')
    : 'Monday to Friday';
  const workingHours = `${workingDays}, ${settings.working_hours_start || '8:00 AM'} to ${settings.working_hours_end || '6:00 PM'}`;

  return res.json({
    dynamic_variables: {
      tenant_id: tenant.id,
      business_name: settings.business_name || tenant.business_name,
      working_hours: workingHours,
      emergency_callback_minutes: String(settings.emergency_callback_minutes || '30'),
    },
  });
});

// ─────────────────────────────────────────────
// POST CALL WEBHOOK
// Retell fires this after every call ENDS
// ─────────────────────────────────────────────

router.post('/webhooks/retell', async (req, res) => {
  const body = req.body;

  console.log('[Webhook] Post-call payload received:', JSON.stringify(body, null, 2));

  const tenantId =
    body.call?.retell_llm_dynamic_variables?.tenant_id ||
    body.metadata?.tenant_id ||
    body.tenant_id ||
    null;

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant_id in payload' });
  }

  const phone =
    body.call?.from_number ||
    body.from_number ||
    body.caller_number ||
    body.metadata?.caller_number ||
    null;

  const name =
    body.call?.retell_llm_dynamic_variables?.caller_name ||
    body.metadata?.caller_name ||
    body.caller_name ||
    null;

  const email = body.metadata?.caller_email || null;
  const jobType = body.metadata?.job_type || null;
  const urgency = body.metadata?.urgency || 'normal';
  const address = body.metadata?.address || null;
  const notes = body.metadata?.notes || null;

  const retellCallId = body.call_id || body.call?.call_id || body.retell_call_id || null;
  const callStatus = body.call_status || body.call?.call_status || 'answered';
  const durationMs = body.duration_ms || body.call?.duration_ms || 0;
  const durationSeconds = durationMs ? Math.round(durationMs / 1000) : body.duration_seconds || 0;
  const transcript = body.transcript || body.call?.transcript || null;
  const summary = body.call_analysis?.call_summary || body.summary || null;
  const recordingUrl = body.recording_url || body.call?.recording_url || null;
  const startedAt = body.start_timestamp
    ? new Date(body.start_timestamp).toISOString()
    : body.call?.start_timestamp
    ? new Date(body.call.start_timestamp).toISOString()
    : new Date().toISOString();
  const endedAt = body.end_timestamp
    ? new Date(body.end_timestamp).toISOString()
    : body.call?.end_timestamp
    ? new Date(body.call.end_timestamp).toISOString()
    : new Date().toISOString();

  const bookingMade =
    body.call_analysis?.custom_analysis_data?.booking_made ||
    body.metadata?.booking_made ||
    false;
  const scheduledAt =
    body.call_analysis?.custom_analysis_data?.scheduled_at ||
    body.metadata?.scheduled_at ||
    null;

  if (!phone) {
    return res.status(400).json({ error: 'Missing phone number in payload' });
  }

  if (retellCallId) {
    const existing = await getCallByRetellId(retellCallId);
    if (existing) {
      console.log(`[Webhook] Duplicate call ${retellCallId} — skipping`);
      return res.status(200).json({ message: 'Duplicate call ignored' });
    }
  }

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

  if (callStatus === 'failed' || callStatus === 'missed') {
    await createEvent(tenantId, lead.id, 'call_failed', { call_status: callStatus });
  } else if (bookingMade && scheduledAt) {
    await createEvent(tenantId, lead.id, 'appointment_booked', { scheduled_at: scheduledAt, lead });
  } else {
    await createEvent(tenantId, lead.id, 'call_completed', {});
    await createEvent(tenantId, lead.id, 'no_booking_after_call', {});
  }

  return res.status(200).json({ success: true, lead_id: lead.id });
});

// ─────────────────────────────────────────────
// SETTINGS API
// ─────────────────────────────────────────────

router.get('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const settings = await getSettings(tenant_id);
  return res.json(settings);
});

router.put('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const updated = await updateSettings(tenant_id, req.body);
  return res.json({ settings: updated });
});

// ─────────────────────────────────────────────
// DASHBOARD API
// ─────────────────────────────────────────────

router.get('/dashboard/overview', async (req, res) => {
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
  const conversionRate = totalLeads > 0 ? ((bookedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  return res.json({
    calls_today: callsToday.count || 0,
    total_leads: totalLeads,
    leads_booked: bookedLeads,
    leads_new: leadsNew.count || 0,
    conversion_rate: `${conversionRate}%`,
  });
});

router.get('/dashboard/leads', async (req, res) => {
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

router.get('/dashboard/leads/:id', async (req, res) => {
  const { id } = req.params;

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

router.get('/dashboard/appointments', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const appointments = await getUpcomingAppointments(tenant_id);
  return res.json({ appointments });
});

router.patch('/dashboard/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { status, calendar_event_id } = req.body;

  if (!status) return res.status(400).json({ error: 'Missing status' });

  const updated = await updateAppointmentStatus(id, status, calendar_event_id);
  return res.json({ appointment: updated });
});

router.patch('/dashboard/leads/:id/assign-human', async (req, res) => {
  const { id } = req.params;
  const updated = await assignToHuman(id);
  return res.json({ lead: updated });
});

router.get('/dashboard/conversations', async (req, res) => {
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

module.exports = router;
