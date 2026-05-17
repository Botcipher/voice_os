const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { upsertLead, assignToHuman } = require('./leadService');
const { saveCall, getCallByRetellId } = require('./callService');
const { getUpcomingAppointments, updateAppointmentStatus, getAppointmentByLead } = require('./appointmentService');
const { createEvent } = require('./eventEngine');
const { getSettings, updateSettings } = require('./settingsService');

const WEB_CALL_TEST_TENANT_ID = '61bb686c-5381-43f6-b65b-07bbd2a1448f';

async function getTenantByPhone(phoneNumber) {
  const { data: tenant, error } = await supabase
    .from('tenants').select('*').eq('phone_number', phoneNumber).single();
  if (error || !tenant) return null;
  const { data: settings } = await supabase
    .from('settings').select('*').eq('tenant_id', tenant.id).single();
  return { tenant, settings: settings || {} };
}

// Look up tenant by the Retell agent_id stored in their settings row
async function getTenantByAgentId(agentId) {
  if (!agentId) return null;
  const { data: settings, error } = await supabase
    .from('settings').select('*').eq('retell_agent_id', agentId).single();
  if (error || !settings) return null;
  const { data: tenant } = await supabase
    .from('tenants').select('*').eq('id', settings.tenant_id).single();
  if (!tenant) return null;
  return { tenant, settings };
}

async function getTenantById(tenantId) {
  const { data: tenant, error } = await supabase
    .from('tenants').select('*').eq('id', tenantId).single();
  if (error || !tenant) return null;
  const { data: settings } = await supabase
    .from('settings').select('*').eq('tenant_id', tenant.id).single();
  return { tenant, settings: settings || {} };
}

function formatWorkingHours(s) {
  const days = Array.isArray(s.working_days) && s.working_days.length > 0
    ? s.working_days.join(', ') : 'Monday to Friday';
  return s.working_hours_start && s.working_hours_end
    ? `${days} ${s.working_hours_start} to ${s.working_hours_end}`
    : 'Monday to Friday 8AM to 6PM';
}

// ── RETELL WEBHOOK
router.post('/webhooks/retell', async (req, res) => {
  const body = req.body;
  const event = body.event;
  const call = body.call || {};

  console.log(`[Webhook] Event: ${event} | Call ID: ${call.call_id} | Type: ${call.call_type}`);
  console.log('[Webhook] Full payload:', JSON.stringify(body, null, 2));

  if (event === 'call_started') {
    let result = null;
    const toNumber = call.to_number;
    const isWebCall = call.call_type === 'web_call' || !toNumber;

    if (!isWebCall) {
      result = await getTenantByPhone(toNumber);
      if (!result) result = await getTenantByAgentId(call.agent_id);
    } else {
      const metaTenantId = call.metadata?.tenant_id;
      if (metaTenantId) result = await getTenantById(metaTenantId);
      if (!result) result = await getTenantByAgentId(call.agent_id);
      if (!result) result = await getTenantById(WEB_CALL_TEST_TENANT_ID);
    }

    if (!result) {
      console.warn('[call_started] No tenant found');
      return res.status(204).send();
    }

    const { tenant, settings: s } = result;
    // Get current date in the business timezone
    const tz = s.timezone || 'UTC';
    const now = new Date();

    const currentDateSpoken = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    });
    const currentDateISO = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

    // Pre-compute all relative dates so the LLM never has to do date arithmetic.
    // GPT-4 reliably fails at "next Monday from 2026-05-17" — we give it the answers.
    const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    // Build a local-noon Date for today in the correct timezone to avoid DST edge cases
    const [yr, mo, dy] = currentDateISO.split('-').map(Number);
    const todayLocal = new Date(yr, mo - 1, dy, 12, 0, 0);
    const todayDow = todayLocal.getDay(); // 0=Sun … 6=Sat

    function addDays(d, n) {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    }
    function isoOf(d) {
      return d.toLocaleDateString('en-CA', { timeZone: tz });
    }

    // Next occurrence of each weekday, always ≥1 day in the future
    // (if today IS that weekday, returns NEXT week's occurrence)
    const nextWeekdays = {};
    for (let i = 0; i < 7; i++) {
      const daysUntil = ((i - todayDow + 7) % 7) || 7;
      nextWeekdays[DOW_NAMES[i]] = isoOf(addDays(todayLocal, daysUntil));
    }

    const dynamicVariables = {
      // ── Tenant identity
      tenant_id:                tenant.id,
      business_name:            s.business_name || tenant.business_name || 'our company',
      industry:                 tenant.industry  || 'home services',
      agent_name:               s.agent_name     || 'Sarah',

      // ── Contact info
      business_email:           s.business_email  || tenant.email || '',
      business_phone:           s.business_phone  || tenant.phone_number || '',
      notify_email:             s.notify_email    || '',

      // ── Schedule config
      working_hours:            formatWorkingHours(s),
      working_hours_start:      s.working_hours_start || '08:00',
      working_hours_end:        s.working_hours_end   || '18:00',
      working_days:             Array.isArray(s.working_days)
                                  ? s.working_days.join(', ')
                                  : 'Monday to Friday',
      slot_duration_minutes:    s.slot_duration_minutes || 60,

      // ── Emergency config
      emergency_callback_minutes: s.emergency_callback_minutes || 30,
      emergency_keywords:         Array.isArray(s.emergency_keywords)
                                    ? s.emergency_keywords.join(', ')
                                    : 'no heat, no ac, gas leak',

      // ── Calendar
      calendar_id:              s.calendar_id || '',

      // ── Date context — pre-computed so the LLM never needs to calculate
      current_date:             currentDateSpoken,
      current_date_iso:         currentDateISO,
      day_of_week:              DOW_NAMES[todayDow],
      tomorrow_iso:             isoOf(addDays(todayLocal, 1)),
      next_monday:              nextWeekdays['Monday'],
      next_tuesday:             nextWeekdays['Tuesday'],
      next_wednesday:           nextWeekdays['Wednesday'],
      next_thursday:            nextWeekdays['Thursday'],
      next_friday:              nextWeekdays['Friday'],
      next_saturday:            nextWeekdays['Saturday'],
      next_sunday:              nextWeekdays['Sunday'],
    };

    console.log('[call_started] Returning variables:', dynamicVariables);

    // Return variables in the response body — this is the correct way for
    // Conversation Flow agents. The old PATCH approach only works for LLM agents.
    return res.status(200).json({ call_inbound_dynamic_variables: dynamicVariables });
  }

  if (event === 'call_ended' || event === 'call_analyzed') {
    const tenantId = call.retell_llm_dynamic_variables?.tenant_id
      || call.call_inbound_dynamic_variables?.tenant_id
      || call.metadata?.tenant_id
      || null;
    if (!tenantId || tenantId === 'unknown' || tenantId === 'default') {
      console.warn(`[${event}] No valid tenant_id — skipping`);
      return res.status(204).send();
    }

    const phone = call.from_number || '+10000000000';

    const retellCallId = call.call_id || null;
    if (retellCallId) {
      const existing = await getCallByRetellId(retellCallId);
      if (existing) return res.status(204).send();
    }

    // Extract caller data from tool call arguments in the transcript.
    // Conversation Flow agents don't populate call_analysis.custom_analysis_data —
    // the data lives in transcript_with_tool_calls as tool invocation arguments.
    const toolData = extractToolCallData(call.transcript_with_tool_calls);
    console.log('[toolData] Extracted:', toolData);

    const { lead } = await upsertLead(tenantId, {
      phone:   toolData.caller_phone || phone,
      name:    toolData.caller_name  || call.retell_llm_dynamic_variables?.caller_name || null,
      email:   call.metadata?.caller_email || null,
      jobType: toolData.job_type     || call.call_analysis?.custom_analysis_data?.job_type  || null,
      urgency: toolData.urgency      || call.call_analysis?.custom_analysis_data?.urgency   || 'normal',
      address: toolData.service_address || call.call_analysis?.custom_analysis_data?.address || null,
      notes:   toolData.notes        || call.call_analysis?.custom_analysis_data?.notes     || null,
      source: 'call',
    });

    await saveCall(tenantId, lead.id, {
      retell_call_id:   retellCallId,
      call_status:      call.call_status || 'answered',
      duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
      transcript:       call.transcript  || null,
      summary:          call.call_analysis?.call_summary || buildSummary(toolData) || null,
      recording_url:    call.recording_url || null,
      started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : new Date().toISOString(),
      ended_at:   call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : new Date().toISOString(),
    });

    const bookingMade = toolData.intent === 'book service appointment'
      || call.call_analysis?.custom_analysis_data?.booking_made
      || false;
    const scheduledAt = toolData.preferred_date || toolData.preferred_time
      ? buildScheduledAt(toolData)
      : call.call_analysis?.custom_analysis_data?.scheduled_at || null;

    if (call.call_status === 'failed' || call.call_status === 'missed') {
      await createEvent(tenantId, lead.id, 'call_failed', { call_status: call.call_status });
    } else if (bookingMade && scheduledAt) {
      await createEvent(tenantId, lead.id, 'appointment_booked', { scheduled_at: scheduledAt, lead });
    } else {
      await createEvent(tenantId, lead.id, 'call_completed', {});
    }

    console.log(`[${event}] Done — tenant: ${tenantId} | lead: ${lead.id}`);
    return res.status(204).send();
  }

  return res.status(204).send();
});

// ── HELPERS for Conversation Flow tool call data extraction

// Find the last booking or availability tool call and return its parsed arguments.
function extractToolCallData(transcriptWithToolCalls) {
  if (!Array.isArray(transcriptWithToolCalls)) return {};

  // Prefer the booking call; fall back to any tool call invocation
  const invocations = transcriptWithToolCalls.filter(e => e.role === 'tool_call_invocation');
  if (invocations.length === 0) return {};

  const booking = [...invocations].reverse().find(e => e.name === 'book_service_appointment');
  const target = booking || invocations[invocations.length - 1];

  try {
    return JSON.parse(target.arguments || '{}');
  } catch {
    return {};
  }
}

// Build a plain-English summary from tool data when Retell doesn't provide one.
function buildSummary(toolData) {
  if (!toolData.caller_name) return null;
  const parts = [`Caller: ${toolData.caller_name}`];
  if (toolData.job_type)        parts.push(`Job: ${toolData.job_type}`);
  if (toolData.urgency)         parts.push(`Urgency: ${toolData.urgency}`);
  if (toolData.service_address) parts.push(`Address: ${toolData.service_address}`);
  if (toolData.preferred_date)  parts.push(`Date: ${toolData.preferred_date}`);
  if (toolData.preferred_time)  parts.push(`Time: ${toolData.preferred_time}`);
  if (toolData.notes)           parts.push(`Notes: ${toolData.notes}`);
  return parts.join(' | ');
}

// Best-effort ISO timestamp from preferred_date + preferred_time strings.
function buildScheduledAt(toolData) {
  try {
    const timePart = toolData.preferred_time || '09:00';
    let datePart = toolData.preferred_date || '';

    if (!datePart) {
      // No date given — use today, but push to tomorrow if time has already passed
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const candidate = new Date(`${todayStr}T${timePart}`);
      if (candidate <= now) {
        // Push to tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        datePart = tomorrow.toISOString().split('T')[0];
      } else {
        datePart = todayStr;
      }
    }

    return new Date(`${datePart}T${timePart}`).toISOString();
  } catch {
    return null;
  }
}

// ── DASHBOARD API

router.get('/dashboard/overview', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });

  const today = new Date(); today.setHours(0,0,0,0);
  const [callsToday, leadsTotal, leadsBooked, leadsNew] = await Promise.all([
    supabase.from('calls').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).gte('created_at', today.toISOString()),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).eq('status', 'booked'),
    supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenant_id).eq('status', 'new'),
  ]);

  const totalLeads = leadsTotal.count || 0;
  const bookedLeads = leadsBooked.count || 0;
  return res.json({
    calls_today: callsToday.count || 0,
    total_leads: totalLeads,
    leads_booked: bookedLeads,
    leads_new: leadsNew.count || 0,
    conversion_rate: totalLeads > 0 ? `${((bookedLeads/totalLeads)*100).toFixed(1)}%` : '0.0%',
  });
});

router.get('/dashboard/leads', async (req, res) => {
  const { tenant_id, status, page = 1 } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;
  let query = supabase.from('leads').select('*', { count: 'exact' }).eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw error;
  return res.json({ leads: data, total: count, page: parseInt(page) });
});

router.get('/dashboard/leads/:id', async (req, res) => {
  const { id } = req.params;
  // Guard against Next.js prefetch requests
  if (!id || id === 'index.txt' || id.includes('.')) return res.status(404).json({ error: 'Not found' });

  const [lead, calls, appointment] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('calls').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    getAppointmentByLead(id),
  ]);
  if (lead.error) return res.status(404).json({ error: 'Lead not found' });
  return res.json({ lead: lead.data, calls: calls.data || [], appointment: appointment || null });
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

// ── SETTINGS API

router.get('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  // Guard against Next.js prefetch requests
  if (!tenant_id || tenant_id === 'index.txt' || tenant_id.includes('.')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const settings = await getSettings(tenant_id);
  return res.json(settings);
});

router.put('/settings/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  if (!tenant_id || tenant_id === 'index.txt' || tenant_id.includes('.')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updated = await updateSettings(tenant_id, req.body);
  return res.json({ settings: updated });
});

// ── OUTBOUND CALL (initiate a real Retell phone call from the dashboard)

router.post('/retell/call', async (req, res) => {
  const { tenant_id, to_number } = req.body;
  if (!tenant_id || !to_number) {
    return res.status(400).json({ error: 'Missing tenant_id or to_number' });
  }

  const settings = await getSettings(tenant_id);
  if (!settings.retell_agent_id || !settings.retell_phone_number) {
    return res.status(400).json({
      error: 'Retell agent ID and phone number must be set in Settings → Retell Integration before you can initiate calls.',
    });
  }

  try {
    const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: settings.retell_phone_number,
        to_number,
        override_agent_id: settings.retell_agent_id,
        metadata: { tenant_id },
        retell_llm_dynamic_variables: {
          tenant_id,
          business_name: settings.business_name || 'our company',
          agent_name: settings.agent_name || 'Sarah',
        },
      }),
    });

    const retellData = await retellRes.json();
    if (!retellRes.ok) {
      console.error('[retell/call] Retell API error:', retellData);
      return res.status(retellRes.status).json({ error: retellData.message || 'Retell API error' });
    }

    console.log(`[retell/call] Outbound call initiated to ${to_number} — call_id: ${retellData.call_id}`);
    return res.json({ call_id: retellData.call_id, status: retellData.status });
  } catch (err) {
    console.error('[retell/call] Network error:', err.message);
    return res.status(500).json({ error: 'Failed to reach Retell API' });
  }
});

module.exports = router;
