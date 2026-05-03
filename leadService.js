const supabase = require('./supabase');

// Find or create a lead — never duplicate by phone + tenant
async function upsertLead(tenantId, data) {
  const { phone, name, email, source, jobType, urgency, address, notes } = data;

  if (!phone) throw new Error('Phone number is required to upsert lead');

  // Check if lead already exists for this tenant
  const { data: existing, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows found — that's fine, anything else is a real error
    throw fetchError;
  }

  if (existing) {
    // Lead exists — update fields that may have changed
    const updates = {
      updated_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    };

    if (name && name !== existing.name) updates.name = name;
    if (email && email !== existing.email) updates.email = email;
    if (jobType) updates.job_type = jobType;
    if (urgency) updates.urgency = urgency;
    if (address) updates.address = address;
    if (notes) updates.notes = notes;

    const { data: updated, error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) throw updateError;
    return { lead: updated, created: false };
  }

  // New lead — create it
  const { data: created, error: createError } = await supabase
    .from('leads')
    .insert({
      tenant_id: tenantId,
      phone,
      name: name || null,
      email: email || null,
      source: source || 'call',
      status: 'new',
      job_type: jobType || null,
      urgency: urgency || 'normal',
      address: address || null,
      notes: notes || null,
      assigned_to: 'ai',
      do_not_contact: false,
      active_conversation: false,
      last_contact_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createError) throw createError;
  return { lead: created, created: true };
}

// Update lead status
async function updateLeadStatus(leadId, status) {
  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Mark lead as human-handled — stops all AI automation
async function assignToHuman(leadId) {
  const { data, error } = await supabase
    .from('leads')
    .update({
      assigned_to: 'human',
      active_conversation: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get lead by id
async function getLeadById(leadId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) throw error;
  return data;
}

module.exports = { upsertLead, updateLeadStatus, assignToHuman, getLeadById };
