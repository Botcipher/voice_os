'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { useSettings } from '../../context/settings'
import { api } from '../../lib/api'

const STATUSES = ['all', 'new', 'contacted', 'qualified', 'booked', 'lost']

function DetailPanel({ lead, calls, appointment, onClose, onAssignHuman }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.12)', zIndex: 199 }} className="fade-in" />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 450, background: '#fff', borderLeft: '1px solid var(--border)', zIndex: 200, overflowY: 'auto', padding: 24 }} className="slide-in">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>{lead.name || 'Unknown Caller'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{lead.phone}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 5, marginBottom: 18, flexWrap: 'wrap' }}>
          <StatusBadge status={lead.status} />
          {lead.urgency === 'emergency' && <StatusBadge status="emergency" />}
          <StatusBadge status={lead.assigned_to || 'ai'} />
        </div>

        {/* Details block */}
        {[
          { label: 'Email',    value: lead.email || '—' },
          { label: 'Source',   value: lead.source || 'call' },
          { label: 'Job Type', value: lead.job_type || '—' },
          { label: 'Created',  value: new Date(lead.created_at).toLocaleDateString() },
          lead.address && { label: 'Address', value: lead.address },
          lead.notes   && { label: 'Notes',   value: lead.notes },
        ].filter(Boolean).map(({ label, value }) => (
          <div key={label} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', textTransform: label === 'Job Type' || label === 'Source' ? 'capitalize' : 'none', lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}

        {/* Appointment */}
        {appointment && (
          <div style={{ marginTop: 18, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>Appointment</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                  {new Date(appointment.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {new Date(appointment.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <StatusBadge status={appointment.status} />
            </div>
          </div>
        )}

        {/* Calls */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>
            Calls ({calls.length})
          </div>
          {calls.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No calls recorded.</div>
          ) : calls.map((call, i) => (
            <div key={call.id} style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: '9px 13px', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <StatusBadge status={call.call_status || 'ended'} />
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{call.duration_seconds}s</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {call.started_at ? new Date(call.started_at).toLocaleDateString() : '—'}
                </span>
              </div>
              {call.summary && <div style={{ padding: '10px 13px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, letterSpacing: '-0.01em' }}>{call.summary}</div>}
              {call.transcript && (
                <details>
                  <summary style={{ padding: '8px 13px', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', userSelect: 'none' }}>
                    Transcript
                  </summary>
                  <div style={{ padding: '10px 13px', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-2)' }}>
                    {call.transcript}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>

        {lead.assigned_to === 'ai' && (
          <button onClick={() => onAssignHuman(lead.id)} style={{
            marginTop: 16, width: '100%', padding: '8px 0',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-3)', fontSize: 12.5,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer', letterSpacing: '-0.01em',
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
          >
            Assign to human (stops AI automation)
          </button>
        )}
      </div>
    </>
  )
}

export default function LeadsPage() {
  const { settings } = useSettings()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const agentName = settings?.agent_name || 'Your agent'

  useEffect(() => {
    setLoading(true)
    api.leads(status === 'all' ? null : status, page)
      .then(d => { setLeads(d.leads || []); setTotal(d.total || 0) })
      .finally(() => setLoading(false))
  }, [status, page])

  const openLead = async (id) => {
    setDetailLoading(true); setSelected(id)
    const d = await api.lead(id).catch(() => null)
    setDetail(d); setDetailLoading(false)
  }

  const close = () => { setSelected(null); setDetail(null) }

  const assignHuman = async (id) => {
    await api.assignHuman(id).catch(() => {})
    setLeads(prev => prev.map(l => l.id === id ? { ...l, assigned_to: 'human' } : l))
  }

  return (
    <Shell title="Leads" subtitle={`Every caller ${agentName} has spoken to`}>
      {selected && detail && (
        <DetailPanel lead={detail.lead} calls={detail.calls} appointment={detail.appointment} onClose={close} onAssignHuman={assignHuman} />
      )}
      {selected && detailLoading && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.12)', zIndex: 199 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 450, background: '#fff', borderLeft: '1px solid var(--border)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader />
          </div>
        </>
      )}

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }} style={{
            padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: status === s ? 500 : 400,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer', letterSpacing: '-0.01em',
            background: status === s ? 'var(--text)' : 'transparent',
            color: status === s ? '#fff' : 'var(--text-3)',
            border: `1px solid ${status === s ? 'var(--text)' : 'var(--border)'}`,
            transition: 'all 0.1s',
          }}>
            {s}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-3)' }}>
          {total} total
        </span>
      </div>

      <div className="card" style={{ overflow: 'hidden', animation: 'fadeUp 0.22s ease forwards' }}>
        {loading ? <Loader /> : leads.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No leads{status !== 'all' ? ` with status "${status}"` : ''}.
          </div>
        ) : (
          <table>
            <thead><tr>{['Name','Phone','Job','Urgency','Status','Assigned','Date'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} onClick={() => openLead(lead.id)}>
                  <td style={{ fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>{lead.name || 'Unknown'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-3)' }}>{lead.phone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
                  <td>{lead.urgency === 'emergency' ? <StatusBadge status="emergency" /> : <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>—</span>}</td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td><StatusBadge status={lead.assigned_to || 'ai'} /></td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--text-3)' }}>
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, alignItems: 'center' }}>
          {page > 1 && <button onClick={() => setPage(p => p-1)} className="btn">← Prev</button>}
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>Page {page}</span>
          {leads.length === 20 && <button onClick={() => setPage(p => p+1)} className="btn">Next →</button>}
        </div>
      )}
    </Shell>
  )
}
