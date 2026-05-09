// All API calls use relative URLs
// Browser → Express (port 10000) → API routes handled there
// Dashboard pages → Express → proxied to Next.js (port 3001)
const TENANT_ID = '61bb686c-5381-43f6-b65b-07bbd2a1448f'

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export { TENANT_ID }

export const api = {
  overview:          ()               => apiFetch(`/dashboard/overview?tenant_id=${TENANT_ID}`),
  leads:             (status, page=1) => apiFetch(`/dashboard/leads?tenant_id=${TENANT_ID}${status?`&status=${status}`:''}&page=${page}`),
  lead:              (id)             => apiFetch(`/dashboard/leads/${id}`),
  assignHuman:       (id)             => apiFetch(`/dashboard/leads/${id}/assign-human`, { method: 'PATCH' }),
  appointments:      ()               => apiFetch(`/dashboard/appointments?tenant_id=${TENANT_ID}`),
  updateAppointment: (id, status)     => apiFetch(`/dashboard/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  settings:          ()               => apiFetch(`/settings/${TENANT_ID}`),
  updateSettings:    (data)           => apiFetch(`/settings/${TENANT_ID}`, { method: 'PUT', body: JSON.stringify(data) }),
}
