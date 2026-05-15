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
      // Real phone call — try phone number first, then agent_id as fallback
      result = await getTenantByPhone(toNumber);
      if (!result) {
        result = await getTenantByAgentId(call.agent_id);
      }
    } else {
      // Web call (test or embedded widget) — try metadata tenant_id, then agent_id
      const metaTenantId = call.metadata?.tenant_id;
      if (metaTenantId) {
        result = await getTenantById(metaTenantId);
      }
      if (!result) {
        result = await getTenantByAgentId(call.agent_id);
      }
      if (!result) {
        result = await getTenantById(WEB_CALL_TEST_TENANT_ID);
      }
    }

    if (!result) {
      console.warn('[call_started] No tenant found');
      return res.status(204).send();
    }

    const { tenant, settings: s } = result;
    const dynamicVariables = {
      tenant_id: tenant.id,
      business_name: s.business_name || tenant.business_name || 'our company',
      agent_name: s.agent_name || 'Sarah',
      working_hours: formatWorkingHours(s),
      emergency_callback_minutes: s.emergency_callback_minutes || 30,
    };

    console.log('[call_started] Injecting variables:', dynamicVariables);

    try {
      const patchRes = await fetch(`https://api.retellai.com/v2/call/${call.call_id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.RETELL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ retell_llm_dynamic_variables: dynamicVariables }),
      });
      if (!patchRes.ok) console.error('[call_started] PATCH failed:', await patchRes.text());
      else console.log('[call_started] Variables injected for:', dynamicVariables.business_name);
    } catch (err) {
      console.error('[call_started] Network error:', err.message);
    }

    return res.status(204).send();
  }

  if (event === 'call_ended' || event === 'call_analyzed') {
    const tenantId = call.retell_llm_dynamic_variables?.tenant_id || call.metadata?.tenant_id || null;
    if (!tenantId || tenantId === 'unknown') return res.status(204).send();

    const phone = call.from_number || '+10000000000';

    const retellCallId = call.call_id || null;
    if (retellCallId) {
      const existing = await getCallByRetellId(retellCallId);
      if (existing) return res.status(204).send();
    }

    const { lead } = await upsertLead(tenantId, {
      phone,
      name: call.retell_llm_dynamic_variables?.caller_name || null,
      email: call.metadata?.caller_email || null,
      jobType: call.call_analysis?.custom_analysis_data?.job_type || null,
      urgency: call.call_analysis?.custom_analysis_data?.urgency || 'normal',
      address: call.call_analysis?.custom_analysis_data?.address || null,
      notes: call.call_analysis?.custom_analysis_data?.notes || null,
      source: 'call',
    });

    await saveCall(tenantId, lead.id, {
      retell_call_id: retellCallId,
      call_status: call.call_status || 'answered',
      duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
      transcript: call.transcript || null,
      summary: call.call_analysis?.call_summary || null,
      recording_url: call.recording_url || null,
      started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : new Date().toISOString(),
      ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : new Date().toISOString(),
    });

    const bookingMade = call.call_analysis?.custom_analysis_data?.booking_made || false;
    const scheduledAt = call.call_analysis?.custom_analysis_data?.scheduled_at || null;

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
