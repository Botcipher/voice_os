'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { api } from '../../lib/api'

const STATUSES = ['all', 'new', 'contacted', 'qualified', 'booked', 'lost']

function DetailPanel({ lead, calls, appointment, onClose, onAssignHuman }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
      background: '#0A1120', borderLeft: '1px solid #1A2740',
      zIndex: 200, overflowY: 'auto', padding: 28,
      animation: 'slideIn 0.25s ease forwards',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#DDE4F0', letterSpacing: '-0.02em' }}>{lead.name || 'Unknown Caller'}</h2>
          <div style={{ fontSize: 12, color: '#4A6080', fontFamily: 'DM Mono, monospace', marginTop: 3 }}>{lead.phone}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #1A2740', color: '#4A6080', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatusBadge status={lead.status} />
        {lead.urgency === 'emergency' && <StatusBadge status="emergency" />}
        <StatusBadge status={lead.assigned_to || 'ai'} />
      </div>

      {/* Details */}
      <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2D3F5A', marginBottom: 16 }}>Lead Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: 'Email',    value: lead.email || '—' },
            { label: 'Source',   value: lead.source || 'call' },
            { label: 'Job Type', value: lead.job_type || '—' },
            { label: 'Created',  value: new Date(lead.created_at).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: '#8899AA', textTransform: 'capitalize' }}>{value}</div>
            </div>
          ))}
        </div>
        {lead.address && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 4 }}>Address</div>
            <div style={{ fontSize: 12, color: '#8899AA' }}>{lead.address}</div>
          </div>
        )}
        {lead.notes && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1A2740' }}>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12, color: '#8899AA', lineHeight: 1.6 }}>{lead.notes}</div>
          </div>
        )}
      </div>

      {/* Appointment */}
      {appointment && (
        <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2D3F5A', marginBottom: 14 }}>Appointment</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#DDE4F0' }}>
                {new Date(appointment.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div style={{ fontSize: 12, color: '#4A6080', fontFamily: 'DM Mono, monospace' }}>
                {new Date(appointment.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <StatusBadge status={appointment.status} />
          </div>
        </div>
      )}

      {/* Calls */}
      <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1A2740' }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2D3F5A' }}>
            Calls ({calls.length})
          </div>
        </div>
        {calls.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#2D3F5A', fontSize: 12 }}>No calls recorded yet</div>
        ) : (
          calls.map((call, i) => (
            <div key={call.id} style={{ padding: '16px 20px', borderBottom: i < calls.length - 1 ? '1px solid #1A2740' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusBadge status={call.call_status} />
                  <span style={{ fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>{call.duration_seconds}s</span>
                </div>
                <span style={{ fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>
                  {new Date(call.started_at).toLocaleDateString()}
                </span>
              </div>
              {call.summary && (
                <div style={{ fontSize: 12, color: '#4A6080', lineHeight: 1.6, padding: '10px 12px', background: '#111B30', borderRadius: 7, borderLeft: '2px solid #2563EB', marginBottom: 8 }}>
                  {call.summary}
                </div>
              )}
              {call.transcript && (
                <details>
                  <summary style={{ fontSize: 11, color: '#2563EB', cursor: 'pointer', fontFamily: 'DM Mono, monospace', userSelect: 'none' }}>View transcript</summary>
                  <div style={{ marginTop: 8, padding: 10, background: '#111B30', borderRadius: 7, fontSize: 11, color: '#4A6080', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', fontFamily: 'DM Mono, monospace' }}>
                    {call.transcript}
                  </div>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      {/* Assign Human */}
      {lead.assigned_to === 'ai' && (
        <button onClick={() => onAssignHuman(lead.id)} style={{
          width: '100%', padding: '10px 0',
          background: 'transparent', border: '1px solid #1E3A6E',
          borderRadius: 8, color: '#60A5FA', fontSize: 12,
          fontFamily: 'DM Mono, monospace', cursor: 'pointer',
          transition: 'all 0.15s',
        }}>
          → Assign to Human (stops AI automation)
        </button>
      )}
    </div>
  )
}

export default function LeadsPage() {
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const s = status === 'all' ? null : status
    api.leads(s, page)
      .then(d => { setLeads(d.leads || []); setTotal(d.total || 0) })
      .finally(() => setLoading(false))
  }, [status, page])

  const openLead = async (id) => {
    setDetailLoading(true)
    setSelected(id)
    const d = await api.lead(id).catch(() => null)
    setDetail(d)
    setDetailLoading(false)
  }

  const closePanel = () => { setSelected(null); setDetail(null) }

  const assignHuman = async (id) => {
    await api.assignHuman(id).catch(() => {})
    setLeads(prev => prev.map(l => l.id === id ? { ...l, assigned_to: 'human' } : l))
    if (detail) setDetail(d => ({ ...d, lead: { ...d.lead, assigned_to: 'human' } }))
  }

  return (
    <Shell title="Leads" subtitle="Every caller Sarah has spoken to">
      {/* Overlay */}
      {selected && (
        <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(7,12,24,0.6)', zIndex: 199 }} />
      )}

      {/* Detail Panel */}
      {selected && detail && (
        <DetailPanel
          lead={detail.lead}
          calls={detail.calls}
          appointment={detail.appointment}
          onClose={closePanel}
          onAssignHuman={assignHuman}
        />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 11,
            fontWeight: 600, fontFamily: 'DM Mono, monospace',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            cursor: 'pointer',
            background: status === s ? 'rgba(37,99,235,0.15)' : 'transparent',
            color: status === s ? '#60A5FA' : '#4A6080',
            border: status === s ? '1px solid rgba(37,99,235,0.35)' : '1px solid #1A2740',
            transition: 'all 0.15s',
          }}>{s}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#2D3F5A' }}>{total} total</span>
      </div>

      {/* Table */}
      <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? <Loader text="Fetching leads..." /> : leads.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: '#2D3F5A', fontSize: 13 }}>
            No leads found{status !== 'all' ? ` with status "${status}"` : ''}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Phone', 'Job Type', 'Urgency', 'Status', 'Assigned', 'Created'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', borderBottom: '1px solid #1A2740' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}
                  onClick={() => openLead(lead.id)}
                  style={{ borderBottom: '1px solid #1A2740', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 20px', fontSize: 13, color: '#DDE4F0', fontWeight: 600 }}>{lead.name || 'Unknown'}</td>
                  <td style={{ padding: '13px 20px', fontSize: 11, color: '#4A6080', fontFamily: 'DM Mono, monospace' }}>{lead.phone}</td>
                  <td style={{ padding: '13px 20px', fontSize: 12, color: '#4A6080', textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
                  <td style={{ padding: '13px 20px' }}>{lead.urgency === 'emergency' ? <StatusBadge status="emergency" /> : <span style={{ fontSize: 11, color: '#2D3F5A' }}>Normal</span>}</td>
                  <td style={{ padding: '13px 20px' }}><StatusBadge status={lead.status} /></td>
                  <td style={{ padding: '13px 20px' }}><StatusBadge status={lead.assigned_to || 'ai'} /></td>
                  <td style={{ padding: '13px 20px', fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          {page > 1 && (
            <button onClick={() => setPage(p => p - 1)} style={{ padding: '7px 18px', borderRadius: 8, background: '#0D1526', border: '1px solid #1A2740', color: '#8899AA', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>← Prev</button>
          )}
          <span style={{ padding: '7px 14px', fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>Page {page}</span>
          {leads.length === 20 && (
            <button onClick={() => setPage(p => p + 1)} style={{ padding: '7px 18px', borderRadius: 8, background: '#0D1526', border: '1px solid #1A2740', color: '#8899AA', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>Next →</button>
          )}
        </div>
      )}
    </Shell>
  )
}
