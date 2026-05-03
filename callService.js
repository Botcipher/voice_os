const supabase = require('./supabase');

// Save a call record from Retell webhook data
async function saveCall(tenantId, leadId, retellData) {
  const {
    retell_call_id,
    call_status,
    duration_seconds,
    transcript,
    summary,
    recording_url,
    started_at,
    ended_at,
  } = retellData;

  const { data, error } = await supabase
    .from('calls')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      retell_call_id: retell_call_id || null,
      call_status: call_status || 'answered',
      duration_seconds: duration_seconds || 0,
      transcript: transcript || null,
      summary: summary || null,
      recording_url: recording_url || null,
      started_at: started_at || new Date().toISOString(),
      ended_at: ended_at || new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get all calls for a lead
async function getCallsByLead(leadId) {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get call by retell call id — prevent duplicate saves
async function getCallByRetellId(retellCallId) {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('retell_call_id', retellCallId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

module.exports = { saveCall, getCallsByLead, getCallByRetellId };
