const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { upsertLead, assignToHuman } = require('./leadService');
const { saveCall, getCallByRetellId } = require('./callService');
const { getUpcomingAppointments, updateAppointmentStatus, getAppointmentByLead } = require('./appointmentService');
const { createEvent } = require('./eventEngine');
const { getSettings, updateSettings } = require('./settingsService');

const WEB_CALL_TEST_TENANT_ID = '61bb686c-5381-43f6-b65b-07bbd2a1448f';

// ── SSE DEBUG INFRASTRUCTURE
// Keeps a list of connected debug page clients and a rolling buffer of events.
const sseClients  = [];
const eventBuffer = []; // last 200 events, survives page refresh
const MAX_BUFFER  = 200;

function emitDebugEvent(type, data) {
  const event = { type, data, ts: new Date().toISOString() };
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER) eventBuffer.shift();
  const payload = 'data: ' + JSON.stringify(event) + '\n\n';
  sseClients.forEach(client => { try { client.write(payload); } catch (_) {} });
}


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

function buildDynamicVariables(tenant, s) {
  const tz = s.timezone || 'UTC';
  const now = new Date();
  const currentDateSpoken = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
  });
  const currentDateISO = now.toLocaleDateString('en-CA', { timeZone: tz });
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const [yr, mo, dy] = currentDateISO.split('-').map(Number);
  const todayLocal = new Date(yr, mo - 1, dy, 12, 0, 0);
  const todayDow = todayLocal.getDay();
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function isoOf(d) { return d.toLocaleDateString('en-CA', { timeZone: tz }); }
  const nextWeekdays = {};
  for (let i = 0; i < 7; i++) {
    const daysUntil = ((i - todayDow + 7) % 7) || 7;
    nextWeekdays[DOW_NAMES[i]] = isoOf(addDays(todayLocal, daysUntil));
  }
  return {
    tenant_id:                  tenant.id,
    business_name:              s.business_name || tenant.business_name || 'our company',
    industry:                   tenant.industry  || 'home services',
    agent_name:                 s.agent_name     || 'Sarah',
    business_email:             s.business_email  || tenant.email || '',
    business_phone:             s.business_phone  || tenant.phone_number || '',
    notify_email:               s.notify_email    || '',
    working_hours:              formatWorkingHours(s),
    working_hours_start:        s.working_hours_start || '08:00',
    working_hours_end:          s.working_hours_end   || '18:00',
    working_days:               Array.isArray(s.working_days) ? s.working_days.join(', ') : 'Monday to Friday',
    slot_duration_minutes:      s.slot_duration_minutes || 60,
    emergency_callback_minutes: s.emergency_callback_minutes || 30,
    emergency_keywords:         Array.isArray(s.emergency_keywords) ? s.emergency_keywords.join(', ') : 'no heat, no ac, gas leak',
    calendar_id:                s.calendar_id || '',
    current_date:               currentDateSpoken,
    current_date_iso:           currentDateISO,
    day_of_week:                DOW_NAMES[todayDow],
    tomorrow_iso:               isoOf(addDays(todayLocal, 1)),
    next_monday:                nextWeekdays['Monday'],
    next_tuesday:               nextWeekdays['Tuesday'],
    next_wednesday:             nextWeekdays['Wednesday'],
    next_thursday:              nextWeekdays['Thursday'],
    next_friday:                nextWeekdays['Friday'],
    next_saturday:              nextWeekdays['Saturday'],
    next_sunday:                nextWeekdays['Sunday'],
  };
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
      emitDebugEvent('error', {
        message: 'No tenant found for this call',
        call_id: call.call_id,
        to_number: toNumber || null,
        agent_id: call.agent_id || null,
        is_web_call: isWebCall,
      });
      return res.status(204).send();
    }

    const { tenant, settings: s } = result;
    const dynamicVariables = buildDynamicVariables(tenant, s);

    console.log('[call_started] Returning variables:', dynamicVariables);

    emitDebugEvent('call_started', {
      call_id:       call.call_id,
      call_type:     call.call_type,
      tenant_id:     tenant.id,
      tenant_name:   tenant.business_name || s.business_name,
      lookup_method: isWebCall
        ? (call.metadata?.tenant_id ? 'metadata.tenant_id' : call.agent_id ? 'agent_id' : 'fallback_test_id')
        : (toNumber ? 'phone_number' : 'agent_id'),
      variables_sent: dynamicVariables,
    });

    // Single Prompt agents use retell_llm_dynamic_variables
    // Conversation Flow agents use call_inbound_dynamic_variables
    // Returning both keys ensures compatibility with either agent type
    return res.status(200).json({
      retell_llm_dynamic_variables: dynamicVariables,
      call_inbound_dynamic_variables: dynamicVariables,
    });
  }

  if (event === 'call_ended' || event === 'call_analyzed') {
    const tenantId = call.retell_llm_dynamic_variables?.tenant_id
      || call.call_inbound_dynamic_variables?.tenant_id
      || call.metadata?.tenant_id
      || null;
    emitDebugEvent('call_ended', {
      call_id:    call.call_id,
      event:      event,
      tenant_id:  tenantId,
      duration_s: call.end_timestamp && call.start_timestamp
        ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : null,
    });

    if (!tenantId || tenantId === 'unknown' || tenantId === 'default') {
      console.warn('[' + event + '] No valid tenant_id \u2014 skipping');
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

// ── REGISTER WEB CALL
// Creates a Retell web call session from the backend so the call_started
// webhook fires and all dynamic variables are injected properly —
// even during testing from the dashboard or an embedded widget.
router.post('/retell/register-web-call', async (req, res) => {
  const { tenant_id } = req.body;
  const resolvedTenantId = tenant_id || WEB_CALL_TEST_TENANT_ID;

  const result = await getTenantById(resolvedTenantId);
  if (!result) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const { tenant, settings: s } = result;
  if (!s.retell_agent_id) {
    return res.status(400).json({ error: 'No Retell agent ID configured for this tenant. Set it in Settings.' });
  }

  try {
    const retellRes = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: s.retell_agent_id,
        metadata: { tenant_id: resolvedTenantId },
      }),
    });

    const data = await retellRes.json();
    if (!retellRes.ok) {
      console.error('[register-web-call] Retell error:', data);
      return res.status(retellRes.status).json({ error: data.message || 'Retell API error' });
    }

    console.log(`[register-web-call] Created web call — call_id: ${data.call_id}`);
    emitDebugEvent('web_call_registered', {
      call_id:     data.call_id,
      tenant_id:   resolvedTenantId,
      tenant_name: result.tenant?.business_name || result.settings?.business_name || 'unknown',
      agent_id:    s.retell_agent_id,
    });
    // Return the access_token so the frontend/widget can connect
    return res.json({
      call_id:      data.call_id,
      access_token: data.access_token,
    });
  } catch (err) {
    console.error('[register-web-call] Network error:', err.message);
    return res.status(500).json({ error: 'Failed to reach Retell API' });
  }
});



// ── SSE STREAM for debug page
router.get('/debug/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay buffer so page loads show recent history
  eventBuffer.forEach(ev => {
    res.write('data: ' + JSON.stringify(ev) + '\n\n');
  });

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 25000);

  sseClients.push(res);
  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx > -1) sseClients.splice(idx, 1);
  });
});

// ── LIST TENANTS (for test-call page dropdown)
router.get('/internal/tenants', async (req, res) => {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, business_name, industry')
    .order('business_name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ tenants: data });
});

// ── TEST CALL PAGE
router.get('/test-call', (req, res) => {
  const password = process.env.TEST_CALL_PASSWORD || 'voiceos2025';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Voice OS — Test Call</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#ffffff;--surface:#f4f4f5;--border:#e4e4e7;
      --accent:#18181b;--accent-h:#3f3f46;
      --danger:#dc2626;--danger-h:#b91c1c;
      --success:#16a34a;--warn:#d97706;
      --text:#18181b;--muted:#71717a;--r:10px;
    }
    html,body{height:100%;overflow:hidden}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column}

    /* ── top bar */
    .topbar{display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
    .topbar .logo{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
    .topbar .title{font-size:15px;font-weight:600}
    .conn-badge{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
    .conn-dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
    .conn-dot.live{background:var(--success);animation:blink 1.5s infinite}

    /* ── main layout */
    .layout{display:flex;flex:1;overflow:hidden}

    /* ── left panel */
    .left{width:320px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;padding:24px}
    .section-title{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
    label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px}
    select,input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;padding:10px 12px;outline:none;transition:border-color .15s;margin-bottom:16px;appearance:none}
    select:focus,input:focus{border-color:var(--accent)}
    .btn{width:100%;padding:11px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s,opacity .15s;margin-bottom:8px}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .btn-black{background:var(--accent);color:#fff}
    .btn-black:hover:not(:disabled){background:var(--accent-h)}
    .btn-red{background:var(--danger);color:#fff}
    .btn-red:hover:not(:disabled){background:var(--danger-h)}
    .btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
    .btn-outline:hover:not(:disabled){border-color:var(--accent);background:var(--surface)}
    .btn-outline.muted-on{border-color:var(--danger);color:var(--danger)}
    .status-pill{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px}
    .pill-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0}
    .pill-dot.live{background:var(--success);animation:blink 1.5s infinite}
    .pill-dot.connecting{background:var(--warn);animation:blink .8s infinite}
    .pill-timer{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px}
    .err-box{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:var(--danger);font-size:13px;padding:10px 12px;margin-bottom:14px}
    .divider{border:none;border-top:1px solid var(--border);margin:20px 0}

    /* ── right panel */
    .right{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .tabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0}
    .tab{padding:12px 20px;font-size:13px;font-weight:600;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
    .tab.active{color:var(--text);border-bottom-color:var(--accent)}
    .tab-panel{flex:1;overflow-y:auto;padding:16px 20px;display:none}
    .tab-panel.active{display:block}

    /* ── transcript */
    .transcript-empty{color:var(--muted);font-size:13px;text-align:center;margin-top:40px}
    .msg{margin-bottom:12px;max-width:80%}
    .msg.agent{margin-right:auto}
    .msg.user{margin-left:auto;text-align:right}
    .msg-role{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
    .msg-bubble{display:inline-block;padding:9px 13px;border-radius:10px;font-size:14px;line-height:1.5}
    .msg.agent .msg-bubble{background:var(--surface);border:1px solid var(--border)}
    .msg.user  .msg-bubble{background:var(--accent);color:#fff}

    /* ── backend log */
    .log-entry{border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;font-size:12px}
    .log-header{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);cursor:pointer;user-select:none}
    .log-type{font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:11px}
    .log-type.call_started{color:var(--success)}
    .log-type.call_ended{color:var(--muted)}
    .log-type.web_call_registered{color:#6366f1}
    .log-type.error{color:var(--danger)}
    .log-ts{color:var(--muted);margin-left:auto;font-size:11px}
    .log-body{padding:10px 12px;background:#fff;border-top:1px solid var(--border);display:none;overflow-x:auto}
    .log-body.open{display:block}
    .log-body pre{white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.6;color:var(--text)}
    .log-empty{color:var(--muted);font-size:13px;text-align:center;margin-top:40px}

    @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
    .hidden{display:none!important}
  </style>
</head>
<body>

<!-- Top bar -->
<div class="topbar">
  <span class="logo">Voice OS</span>
  <span class="title">Test &amp; Debug</span>
  <div class="conn-badge">
    <div class="conn-dot" id="sse-dot"></div>
    <span id="sse-label">Disconnected</span>
  </div>
</div>

<div class="layout">

  <!-- Left: Call controls -->
  <div class="left">

    <!-- Password gate -->
    <div id="pw-screen">
      <div class="section-title">Access</div>
      <div id="pw-err" class="err-box hidden">Wrong password</div>
      <label>Password</label>
      <div style="position:relative;margin-bottom:16px">
        <input id="pw-input" type="password" placeholder="Password" style="margin-bottom:0;padding:10px 40px 10px 12px"/>
        <button type="button" onclick="togglePwVis()" id="pw-vis-btn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#8c8c8c;font-size:13px;font-family:inherit;user-select:none">Show</button>
      </div>
      <button class="btn btn-black" onclick="unlock()">Continue</button>
    </div>

    <!-- Call controls -->
    <div id="call-screen" class="hidden">
      <div class="section-title">Call Controls</div>

      <label>Tenant</label>
      <select id="tenant-sel"><option value="">Loading…</option></select>

      <div id="status-pill" class="status-pill hidden">
        <div class="pill-dot" id="pill-dot"></div>
        <span id="pill-text">Connecting…</span>
        <span class="pill-timer" id="pill-timer">0:00</span>
      </div>

      <div id="call-err" class="err-box hidden"></div>

      <button id="btn-mute"  class="btn btn-outline hidden" onclick="toggleMute()">🎤 &nbsp;Mute</button>
      <button id="btn-start" class="btn btn-black" onclick="startCall()">Start Test Call</button>
      <button id="btn-end"   class="btn btn-red hidden" onclick="endCall()">End Call</button>
    </div>
  </div>

  <!-- Right: Transcript + Logs -->
  <div class="right">
    <div class="tabs">
      <div class="tab active" onclick="switchTab('transcript')">Transcript</div>
      <div class="tab" onclick="switchTab('log')">Backend Log <span id="log-badge"></span></div>
    </div>

    <div id="tab-transcript" class="tab-panel active">
      <div class="transcript-empty" id="tx-empty">Start a call to see the live transcript.</div>
      <div id="tx-messages"></div>
    </div>

    <div id="tab-log" class="tab-panel">
      <div class="log-empty" id="log-empty">Waiting for backend events…</div>
      <div id="log-entries"></div>
    </div>
  </div>
</div>

<script>
const PASSWORD = '${password}';
let retellClient = null;
let timerInterval = null;
let seconds = 0;
let muted = false;
let callState = 'idle'; // idle | registering | active | ended
let agentDisplayName = 'Agent'; // updated when call starts from backend log data

// ── Password
function unlock() {
  if (document.getElementById('pw-input').value.trim() === PASSWORD.trim()) {
    document.getElementById('pw-screen').classList.add('hidden');
    document.getElementById('call-screen').classList.remove('hidden');
    loadTenants();
    connectSSE();
  } else {
    document.getElementById('pw-err').classList.remove('hidden');
  }
}
function togglePwVis() {
  const input = document.getElementById('pw-input');
  const btn   = document.getElementById('pw-vis-btn');
  if (input.type === 'password') { input.type = 'text';     btn.textContent = 'Hide'; }
  else                           { input.type = 'password'; btn.textContent = 'Show'; }
}
document.addEventListener('DOMContentLoaded', function() {
  var pi = document.getElementById('pw-input');
  if (pi) pi.addEventListener('keydown', function(e){ if(e.key==='Enter') unlock(); });
});

// ── Tabs
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function(t,i){ t.classList.toggle('active', ['transcript','log'][i]===name); });
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('tab-'+name).classList.add('active');
  if (name==='log') document.getElementById('log-badge').textContent='';
}

// ── Tenants
function loadTenants() {
  fetch('/internal/tenants').then(function(r){ return r.json(); }).then(function(d) {
    var sel = document.getElementById('tenant-sel');
    sel.innerHTML = '<option value="">\u2014 Pick a tenant \u2014</option>';
    (d.tenants||[]).forEach(function(t) {
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.business_name + (t.industry ? ' \u00b7 '+t.industry : '');
      sel.appendChild(o);
    });
  }).catch(function(e){ showCallErr('Could not load tenants: '+e.message); });
}

// ── SSE
function connectSSE() {
  var es = new EventSource('/debug/stream');
  var dot = document.getElementById('sse-dot');
  var lbl = document.getElementById('sse-label');
  es.onopen = function(){ dot.classList.add('live'); lbl.textContent='Live'; };
  es.onerror = function(){ dot.classList.remove('live'); lbl.textContent='Reconnecting\u2026'; };
  es.onmessage = function(e) { try { addLogEntry(JSON.parse(e.data)); } catch(_){} };
}

// ── Log entries
function addLogEntry(event) {
  var isEmpty = document.getElementById('log-empty');
  if (isEmpty) isEmpty.remove();
  var isLogTab = document.getElementById('tab-log').classList.contains('active');
  if (!isLogTab) document.getElementById('log-badge').textContent=' \u00b7';
  var container = document.getElementById('log-entries');
  var entry = document.createElement('div');
  entry.className = 'log-entry';
  var time = new Date(event.ts).toLocaleTimeString();
  entry.innerHTML =
    '<div class="log-header" onclick="this.nextElementSibling.classList.toggle(&quot;open&quot;)">' +
      '<span class="log-type '+event.type+'">'+event.type.replace(/_/g,' ')+'</span>' +
      '<span class="log-ts">'+time+'</span>' +
    '</div>' +
    '<div class="log-body">' +
      '<pre>'+JSON.stringify(event.data,null,2)+'</pre>' +
    '</div>';
  if (event.type==='call_started'||event.type==='error') {
    entry.querySelector('.log-body').classList.add('open');
    if (event.type==='call_started') {
      switchTab('log');
      // Capture agent name so transcript shows real name not "Sarah"
      if (event.data && event.data.variables_sent && event.data.variables_sent.agent_name) {
        agentDisplayName = event.data.variables_sent.agent_name;
      }
    }
  }
  container.prepend(entry);
}

// ── Start call — dynamically imports SDK only when needed
async function startCall() {
  // Prevent double-start
  if (callState === 'registering' || callState === 'active') return;
  var tenantId = document.getElementById('tenant-sel').value;
  if (!tenantId) return showCallErr('Pick a tenant first.');

  callState = 'registering';
  hideCallErr();
  setStatus('connecting', 'Registering\u2026');
  document.getElementById('btn-start').disabled = true;

  try {
    var d = await fetch('/retell/register-web-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId })
    }).then(function(r) { return r.json(); });

    if (d.error) throw new Error(d.error);

    // Destroy any leftover client before creating a new one
    if (retellClient) {
      try { retellClient.stopCall(); } catch(_) {}
      retellClient = null;
    }

    var mod = await import('https://esm.sh/retell-client-js-sdk');
    var RetellWebClient = mod.RetellWebClient;
    retellClient = new RetellWebClient();

    retellClient.on('call-started', function() {
      if (callState === 'ended') return; // already ended before this fired
      callState = 'active';
      setStatus('live', 'Live');
      clearInterval(timerInterval);
      startTimer();
      document.getElementById('btn-start').classList.add('hidden');
      document.getElementById('btn-end').classList.remove('hidden');
      document.getElementById('btn-mute').classList.remove('hidden');
      clearTranscript();
      switchTab('transcript');
    });

    retellClient.on('update', function(u) {
      if (u.transcript) renderTranscript(u.transcript, agentDisplayName);
    });

    retellClient.on('call-ended', function() {
      // Only handle once
      if (callState === 'ended' || callState === 'idle') return;
      showCallEndedState();
    });

    retellClient.on('error', function(err) {
      showCallErr((err && err.message) || 'Call error');
      showCallEndedState();
    });

    await retellClient.startCall({ accessToken: d.access_token });

    // Show End Call button right after startCall resolves
    // (call-started may fire before or after this line — both are handled)
    if (callState === 'registering') {
      callState = 'active';
      setStatus('connecting', 'Connecting\u2026');
      startTimer();
      document.getElementById('btn-start').classList.add('hidden');
      document.getElementById('btn-end').classList.remove('hidden');
      document.getElementById('btn-mute').classList.remove('hidden');
      clearTranscript();
      switchTab('transcript');
    }

  } catch(e) {
    showCallErr(e.message);
    showCallEndedState();
  }
}

function endCall() {
  if (callState === 'idle' || callState === 'ended') return;
  if (retellClient) {
    try { retellClient.stopCall(); } catch(_) {}
  }
  // Don't wait for call-ended event — force the UI reset now
  showCallEndedState();
}

function toggleMute() {
  if (!retellClient || callState !== 'active') return;
  muted = !muted;
  try { retellClient.mute(muted); } catch(_) {}
  var btn = document.getElementById('btn-mute');
  btn.textContent = muted ? '\ud83d\udd07\u00a0 Unmute' : '\ud83c\udfa4\u00a0 Mute';
  btn.classList.toggle('muted-on', muted);
}

// ── Transcript
function clearTranscript() {
  document.getElementById('tx-messages').innerHTML = '';
  document.getElementById('tx-empty').classList.add('hidden');
}
function renderTranscript(transcript, agentName) {
  var name = agentName || agentDisplayName || 'Agent';
  var container = document.getElementById('tx-messages');
  container.innerHTML = '';
  transcript.forEach(function(msg) {
    var isAgent = msg.role === 'agent';
    var div = document.createElement('div');
    div.className = 'msg ' + (isAgent ? 'agent' : 'user');
    div.innerHTML = '<div class="msg-role">' + (isAgent ? name : 'Caller') + '</div>' +
      '<div class="msg-bubble">' + msg.content + '</div>';
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

// ── Helpers
function setStatus(state, text) {
  document.getElementById('status-pill').classList.remove('hidden');
  document.getElementById('pill-dot').className = 'pill-dot ' + state;
  document.getElementById('pill-dot').style.background = '';
  document.getElementById('pill-text').textContent = text;
}
function startTimer() {
  seconds = 0; clearInterval(timerInterval);
  timerInterval = setInterval(function() {
    seconds++;
    var m = Math.floor(seconds / 60), s = String(seconds % 60).padStart(2, '0');
    document.getElementById('pill-timer').textContent = m + ':' + s;
  }, 1000);
}
function showCallEndedState() {
  // Guard: if already idle, do nothing
  if (callState === 'idle') return;
  callState = 'ended';
  clearInterval(timerInterval);
  // Safely destroy client
  if (retellClient) {
    try { retellClient.stopCall(); } catch(_) {}
    retellClient = null;
  }
  muted = false;
  // Update UI
  document.getElementById('status-pill').classList.remove('hidden');
  var dot = document.getElementById('pill-dot');
  dot.className = 'pill-dot';
  dot.style.background = '#71717a';
  document.getElementById('pill-text').textContent = 'Call ended';
  document.getElementById('pill-timer').textContent = '0:00';
  document.getElementById('btn-end').classList.add('hidden');
  document.getElementById('btn-mute').classList.add('hidden');
  document.getElementById('btn-mute').textContent = '\ud83c\udfa4\u00a0 Mute';
  var startBtn = document.getElementById('btn-start');
  startBtn.textContent = 'Start New Call';
  startBtn.classList.remove('hidden');
  startBtn.disabled = false;
  callState = 'idle';
}
function resetCall() {
  callState = 'ended'; // triggers showCallEndedState guard properly
  showCallEndedState();
}
function showCallErr(msg) {
  var e = document.getElementById('call-err');
  e.textContent = msg; e.classList.remove('hidden');
}
function hideCallErr() { document.getElementById('call-err').classList.add('hidden'); }
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

module.exports = router;
