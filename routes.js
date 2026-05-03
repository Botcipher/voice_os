const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { upsertLead, updateLeadStatus, assignToHuman } = require('./leadService');
const { saveCall, getCallByRetellId } = require('./callService');
const { getUpcomingAppointments, updateAppointmentStatus, getAppointmentByLead } = require('./appointmentService');
const { createEvent } = require('./eventEngine');

// ─────────────────────────────────────────────
// RETELL WEBHOOK
// ─────────────────────────────────────────────

// POST /webhooks/retell
// This is the main entry point — Retell fires this after every call
router.post('/webhooks/retell', async (req, res) => {
  const body = req.body;

  console.log('[Webhook] Retell payload received:', JSON.stringify(body, null, 2));

  // ── 1. Extract and normalize data from Retell payload
  const tenantId = body.metadata?.tenant_id || body.tenant_id;

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant_id in payload' });
  }

  const phone = body.from_number || body.caller_number || body.metadata?.caller_number;
  const name = body.metadata?.caller_name || body.caller_name || null;
  const email = body.metadata?.caller_email || null;
  const jobType = body.metadata?.job_type || null;
  const urgency = body.metadata?.urgency || 'normal';
  const address = body.metadata?.address || null;
  const notes = body.metadata?.notes || null;

  const retellCallId = body.call_id || body.retell_call_id;
  const callStatus = body.call_status || 'answered';
  const durationSeconds = body.duration_ms ? Math.round(body.duration_ms / 1000) : body.duration_seconds || 0;
  const transcript = body.transcript || null;
  const summary = body.call_analysis?.call_summary || body.summary || null;
  const recordingUrl = body.recording_url || null;
  const startedAt = body.start_timestamp ? new Date(body.start_timestamp).toISOString() : new Date().toISOString();
  const endedAt = body.end_timestamp ? new Date(body.end_timestamp).toISOString() : new Date().toISOString();

  const bookingMade = body.call_analysis?.custom_analysis_data?.booking_made || body.metadata?.booking_made || false;
  const scheduledAt = body.call_analysis?.custom_analysis_data?.scheduled_at || body.metadata?.scheduled_at || null;

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
  const { lead } = await upsertLead(tenantId, { phone, name, email, jobType, urgency, address, notes, source: 'call' });

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
    // Call completed but no booking
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
  const conversionRate = totalLeads > 0 ? ((bookedLeads / totalLeads) * 100).toFixed(1) : '0.0';

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

module.exports = router;
