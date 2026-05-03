const supabase = require('./supabase');
const { updateLeadStatus } = require('./leadService');
const { createAppointment } = require('./appointmentService');
const { triggerBookingConfirmation, triggerNotification } = require('./n8nService');

// Write an event to the DB
async function createEvent(tenantId, leadId, eventType, payload = {}) {
  const { data, error } = await supabase
    .from('events')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      event_type: eventType,
      payload,
      processed: false,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`[EventEngine] Created event: ${eventType} for lead ${leadId}`);

  // Process immediately (no queue needed at this scale)
  await processEvent(data);

  return data;
}

// Process a single event
async function processEvent(event) {
  const { id, event_type, tenant_id, lead_id, payload } = event;

  console.log(`[EventEngine] Processing: ${event_type}`);

  try {
    switch (event_type) {

      case 'call_completed':
        await handleCallCompleted(tenant_id, lead_id, payload);
        break;

      case 'appointment_booked':
        await handleAppointmentBooked(tenant_id, lead_id, payload);
        break;

      case 'no_booking_after_call':
        await handleNoBookingAfterCall(tenant_id, lead_id, payload);
        break;

      case 'call_failed':
        await handleCallFailed(tenant_id, lead_id, payload);
        break;

      case 'lead_inactive':
        await handleLeadInactive(tenant_id, lead_id, payload);
        break;

      default:
        console.warn(`[EventEngine] Unknown event type: ${event_type}`);
    }

    // Mark event as processed
    await supabase
      .from('events')
      .update({ processed: true })
      .eq('id', id);

  } catch (err) {
    console.error(`[EventEngine] Error processing event ${event_type}:`, err.message);
    // Don't re-throw — log and move on to avoid crashing the whole request
  }
}

// ─────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────

async function handleCallCompleted(tenantId, leadId, payload) {
  // Update lead status to 'contacted'
  await updateLeadStatus(leadId, 'contacted');
  console.log(`[EventEngine] Lead ${leadId} marked as contacted`);
}

async function handleAppointmentBooked(tenantId, leadId, payload) {
  const { scheduled_at, lead } = payload;

  // Create appointment in DB
  const { appointment, created } = await createAppointment(tenantId, leadId, scheduled_at);

  if (created) {
    // Update lead status to booked
    await updateLeadStatus(leadId, 'booked');

    // Fire n8n booking confirmation
    await triggerBookingConfirmation(lead, appointment);

    // Fire internal notification to business owner
    await triggerNotification(tenantId, 'New job booked', {
      lead_name: lead.name,
      lead_phone: lead.phone,
      job_type: lead.job_type,
      scheduled_at,
    });

    console.log(`[EventEngine] Appointment booked for lead ${leadId}`);
  } else {
    console.log(`[EventEngine] Appointment already exists for lead ${leadId} — skipped`);
  }
}

async function handleNoBookingAfterCall(tenantId, leadId, payload) {
  // Update lead status to 'qualified' (they called but didn't book)
  await updateLeadStatus(leadId, 'qualified');

  // Future: trigger follow-up SMS or email sequence here
  console.log(`[EventEngine] Lead ${leadId} qualified — no booking yet, follow-up queued`);
}

async function handleCallFailed(tenantId, leadId, payload) {
  // Don't change status — just log it. Lead may call back.
  console.log(`[EventEngine] Call failed for lead ${leadId} — logged, no status change`);
}

async function handleLeadInactive(tenantId, leadId, payload) {
  // Future: trigger re-engagement sequence
  console.log(`[EventEngine] Lead ${leadId} inactive — re-engagement queued`);
}

module.exports = { createEvent };
