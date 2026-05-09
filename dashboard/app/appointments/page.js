'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { useSettings } from '../../context/settings'
import { api } from '../../lib/api'

export default function AppointmentsPage() {
  const { settings } = useSettings()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  const agentName = settings?.agent_name || 'Your agent'

  useEffect(() => {
    api.appointments().then(d => setAppointments(d.appointments || [])).finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id, status) => {
    await api.updateAppointment(id, status).catch(() => {})
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const upcoming = appointments.filter(a => ['booked','rescheduled'].includes(a.status))
  const past     = appointments.filter(a => ['completed','cancelled'].includes(a.status))

  return (
    <Shell title="Appointments" subtitle={`Bookings made by ${agentName}`}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24, animation: 'fadeUp 0.22s ease forwards' }}>
        {[
          { label: 'Upcoming',  value: upcoming.length },
          { label: 'Completed', value: past.filter(a => a.status === 'completed').length },
          { label: 'Cancelled', value: past.filter(a => a.status === 'cancelled').length },
        ].map((s, i) => (
          <div key={s.label} className="card" style={{ padding: '16px 18px', animation: `fadeUp 0.22s ease ${i*0.05}s both` }}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.035em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? <Loader /> : (
        <>
          {/* Upcoming */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'JetBrains Mono, monospace' }}>
              Upcoming
            </div>
            {upcoming.length === 0 ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No upcoming appointments. {agentName} will populate this once bookings come in.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {upcoming.map((appt, i) => {
                  const date = new Date(appt.scheduled_at)
                  const lead = appt.leads
                  return (
                    <div key={appt.id} className="card" style={{ padding: 18, animation: `fadeUp 0.22s ease ${i*0.05}s both` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.015em' }}>{lead?.name || 'Unknown'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{lead?.phone || '—'}</div>
                        </div>
                        <StatusBadge status={appt.status} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        {[
                          { label: 'Date', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
                          { label: 'Time', value: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), mono: true },
                          lead?.job_type && { label: 'Service', value: lead.job_type, cap: true },
                        ].filter(Boolean).map(f => (
                          <div key={f.label}>
                            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 3 }}>{f.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em', fontFamily: f.mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif', textTransform: f.cap ? 'capitalize' : 'none' }}>{f.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 7, borderTop: '1px solid var(--border)', paddingTop: 13 }}>
                        <button onClick={() => updateStatus(appt.id, 'completed')} style={{
                          flex: 1, padding: '6px 0', background: 'var(--green-bg)', border: '1px solid var(--green-border)',
                          borderRadius: 5, color: 'var(--green)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500,
                        }}>
                          ✓ Complete
                        </button>
                        <button onClick={() => updateStatus(appt.id, 'cancelled')} style={{
                          flex: 1, padding: '6px 0', background: 'var(--red-bg)', border: '1px solid var(--red-border)',
                          borderRadius: 5, color: 'var(--red)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500,
                        }}>
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Past */}
          {past.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'JetBrains Mono, monospace' }}>
                Past
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr>{['Customer','Date & Time','Service','Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {past.map(appt => (
                      <tr key={appt.id} style={{ cursor: 'default' }}>
                        <td style={{ fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>{appt.leads?.name || '—'}</td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-3)' }}>
                          {new Date(appt.scheduled_at).toLocaleDateString()} {new Date(appt.scheduled_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{appt.leads?.job_type || '—'}</td>
                        <td><StatusBadge status={appt.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
