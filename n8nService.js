const axios = require('axios');

// Send payload to an n8n webhook
async function triggerN8n(webhookUrl, payload) {
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return { success: true, status: response.status };
  } catch (err) {
    // Log but don't crash — n8n failure shouldn't break the main flow
    console.error(`[n8n] Failed to trigger ${webhookUrl}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Trigger booking confirmation workflow
async function triggerBookingConfirmation(lead, appointment) {
  const url = process.env.N8N_BOOKING_WEBHOOK;
  if (!url) return console.warn('[n8n] N8N_BOOKING_WEBHOOK not set');

  return triggerN8n(url, {
    event: 'appointment_booked',
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      job_type: lead.job_type,
    },
    appointment: {
      id: appointment.id,
      scheduled_at: appointment.scheduled_at,
    },
    tenant_id: lead.tenant_id,
    triggered_at: new Date().toISOString(),
  });
}

// Trigger reschedule/cancel workflow
async function triggerRescheduleCancel(lead, appointment, action) {
  const url = process.env.N8N_CANCEL_WEBHOOK;
  if (!url) return console.warn('[n8n] N8N_CANCEL_WEBHOOK not set');

  return triggerN8n(url, {
    event: action, // 'appointment_rescheduled' or 'appointment_cancelled'
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    },
    appointment: {
      id: appointment.id,
      scheduled_at: appointment.scheduled_at,
      status: appointment.status,
    },
    tenant_id: lead.tenant_id,
    triggered_at: new Date().toISOString(),
  });
}

// Trigger internal notification (e.g. "new job booked" alert to business owner)
async function triggerNotification(tenantId, message, data = {}) {
  const url = process.env.N8N_NOTIFY_WEBHOOK;
  if (!url) return console.warn('[n8n] N8N_NOTIFY_WEBHOOK not set');

  return triggerN8n(url, {
    event: 'notification',
    tenant_id: tenantId,
    message,
    data,
    triggered_at: new Date().toISOString(),
  });
}

module.exports = {
  triggerBookingConfirmation,
  triggerRescheduleCancel,
  triggerNotification,
};
