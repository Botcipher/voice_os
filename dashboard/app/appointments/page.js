'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { api } from '../../lib/api'

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.appointments()
      .then(d => setAppointments(d.appointments || []))
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id, status) => {
    await api.updateAppointment(id, status).catch(() => {})
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const upcoming = appointments.filter(a => ['booked', 'rescheduled'].includes(a.status))
  const past     = appointments.filter(a => ['completed', 'cancelled'].includes(a.status))

  return (
    <Shell title="Appointments" subtitle="Service bookings from Sarah">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32, animation: 'fadeUp 0.35s ease forwards' }}>
        {[
          { label: 'Upcoming',  value: upcoming.length,                                  accent: '#10B981' },
          { label: 'Completed', value: past.filter(a => a.status === 'completed').length, accent: '#2563EB' },
          { label: 'Cancelled', value: past.filter(a => a.status === 'cancelled').length, accent: '#EF4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.accent}, transparent)` }} />
            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2D3F5A', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#DDE4F0', fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? <Loader text="Fetching appointments..." /> : (
        <>
          {/* Upcoming */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#DDE4F0', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Upcoming</div>
            {upcoming.length === 0 ? (
              <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#2D3F5A', fontSize: 13 }}>
                No upcoming appointments. Sarah will populate this once bookings come in.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {upcoming.map(appt => {
                  const date = new Date(appt.scheduled_at)
                  const lead = appt.leads
                  return (
                    <div key={appt.id} style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, padding: 22, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: '#2563EB', borderRadius: '12px 0 0 12px' }} />
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#DDE4F0' }}>{lead?.name || 'Unknown'}</div>
                            <div style={{ fontSize: 11, color: '#4A6080', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>{lead?.phone || '—'}</div>
                          </div>
                          <StatusBadge status={appt.status} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 4 }}>Date</div>
                            <div style={{ fontSize: 13, color: '#DDE4F0', fontWeight: 600 }}>
                              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 4 }}>Time</div>
                            <div style={{ fontSize: 13, color: '#DDE4F0', fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
                              {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {lead?.job_type && (
                            <div>
                              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 4 }}>Service</div>
                              <div style={{ fontSize: 12, color: '#8899AA', textTransform: 'capitalize' }}>{lead.job_type}</div>
                            </div>
                          )}
                        </div>
                        {/* Quick Actions */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => updateStatus(appt.id, 'completed')} style={{ flex: 1, padding: '7px 0', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 7, color: '#4ADE80', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>✓ Complete</button>
                          <button onClick={() => updateStatus(appt.id, 'cancelled')} style={{ flex: 1, padding: '7px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#F87171', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>✕ Cancel</button>
                        </div>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#DDE4F0', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Past</div>
              <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Customer', 'Date & Time', 'Service', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', borderBottom: '1px solid #1A2740' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {past.map(appt => (
                      <tr key={appt.id} style={{ borderBottom: '1px solid #1A2740' }}>
                        <td style={{ padding: '13px 24px', fontSize: 13, color: '#8899AA' }}>{appt.leads?.name || '—'}</td>
                        <td style={{ padding: '13px 24px', fontSize: 11, color: '#4A6080', fontFamily: 'DM Mono, monospace' }}>
                          {new Date(appt.scheduled_at).toLocaleDateString()} {new Date(appt.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '13px 24px', fontSize: 12, color: '#4A6080', textTransform: 'capitalize' }}>{appt.leads?.job_type || '—'}</td>
                        <td style={{ padding: '13px 24px' }}><StatusBadge status={appt.status} /></td>
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
