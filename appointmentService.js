const supabase = require('./supabase');

// Create a new appointment — checks for existing booking first
async function createAppointment(tenantId, leadId, scheduledAt) {
  // Check if there's already an active booking for this lead
  const { data: existing } = await supabase
    .from('appointments')
    .select('*')
    .eq('lead_id', leadId)
    .in('status', ['booked', 'rescheduled'])
    .single();

  if (existing) {
    // Don't create duplicate — return the existing one
    return { appointment: existing, created: false };
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      scheduled_at: scheduledAt,
      status: 'booked',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return { appointment: data, created: true };
}

// Update appointment status
async function updateAppointmentStatus(appointmentId, status, calendarEventId = null) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (calendarEventId) updates.calendar_event_id = calendarEventId;

  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', appointmentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get upcoming appointments for a tenant — shows from 24 hrs ago so recently booked ones always appear
async function getUpcomingAppointments(tenantId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('appointments')
    .select(`*, leads(name, phone, email, job_type)`)
    .eq('tenant_id', tenantId)
    .in('status', ['booked', 'rescheduled'])
    .gte('scheduled_at', since)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return data;
}

// Get appointment by lead id
async function getAppointmentByLead(leadId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

module.exports = {
  createAppointment,
  updateAppointmentStatus,
  getUpcomingAppointments,
  getAppointmentByLead,
};
