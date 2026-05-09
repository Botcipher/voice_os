// Tenant ID - in production this comes from login/session
// For now it's set here — when you add multi-tenant login,
// store tenant_id in sessionStorage after login and read it here
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || '61bb686c-5381-43f6-b65b-07bbd2a1448f'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export { TENANT_ID }

export const api = {
  overview:          ()                => apiFetch(`/dashboard/overview?tenant_id=${TENANT_ID}`),
  leads:             (status, page=1)  => apiFetch(`/dashboard/leads?tenant_id=${TENANT_ID}${status ? `&status=${status}` : ''}&page=${page}`),
  lead:              (id)              => apiFetch(`/dashboard/leads/${id}`),
  assignHuman:       (id)              => apiFetch(`/dashboard/leads/${id}/assign-human`, { method: 'PATCH' }),
  calls:             ()                => apiFetch(`/dashboard/calls?tenant_id=${TENANT_ID}`),
  appointments:      ()                => apiFetch(`/dashboard/appointments?tenant_id=${TENANT_ID}`),
  updateAppointment: (id, status)      => apiFetch(`/dashboard/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  settings:          ()                => apiFetch(`/settings/${TENANT_ID}`),
  updateSettings:    (data)            => apiFetch(`/settings/${TENANT_ID}`, { method: 'PUT', body: JSON.stringify(data) }),
}
