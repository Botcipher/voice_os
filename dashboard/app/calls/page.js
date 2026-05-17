'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { useSettings } from '../../context/settings'
import { api } from '../../lib/api'

function CallDrawer({ lead, onClose }) {
  const calls = lead?.calls || []
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.12)', zIndex: 199 }} className="fade-in" />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', borderLeft: '1px solid var(--border)', zIndex: 200, overflowY: 'auto', padding: 24 }} className="slide-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>{lead?.lead?.name || 'Unknown Caller'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{lead?.lead?.phone}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
        {calls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>No call records.</div>
        ) : calls.map((call, i) => (
          <div key={call.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={call.call_status || 'ended'} />
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{call.duration_seconds}s</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>
                {call.started_at ? new Date(call.started_at).toLocaleDateString() : '—'}
              </span>
            </div>
            {call.summary && (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, letterSpacing: '-0.01em' }}>{call.summary}</div>
            )}
            {call.transcript && (
              <details>
                <summary style={{ padding: '9px 14px', fontSize: 11.5, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', userSelect: 'none' }}>
                  View full transcript
                </summary>
                <div style={{ padding: '12px 14px', fontSize: 11.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 600, overflow: 'auto', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-2)', borderTop: '1px solid var(--border)' }}>
                  {call.transcript}
                </div>
              </details>
            )}
            {call.recording_url && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                <audio controls style={{ width: '100%', height: 30 }} src={call.recording_url} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export default function CallsPage() {
  const { settings } = useSettings()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const agentName = settings?.agent_name || 'Your agent'

  useEffect(() => {
    api.leads(null, 1).then(d => setLeads(d.leads || [])).finally(() => setLoading(false))
  }, [])

  const openCall = async (id) => {
    setDetailLoading(true); setSelected(id)
    const d = await api.lead(id).catch(() => null)
    setDetail(d); setDetailLoading(false)
  }

  const close = () => { setSelected(null); setDetail(null) }

  return (
    <Shell title="Calls" subtitle={`Every call ${agentName} handled`}>
      {selected && detail && <CallDrawer lead={detail} onClose={close} />}
      {selected && detailLoading && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.12)', zIndex: 199 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', borderLeft: '1px solid var(--border)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader />
          </div>
        </>
      )}
      <div className="card" style={{ overflow: 'hidden', animation: 'fadeUp 0.22s ease forwards' }}>
        {loading ? <Loader /> : leads.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No calls yet. Once {agentName} starts handling calls they will appear here.
          </div>
        ) : (
          <table>
            <thead><tr>{['Caller','Phone','Job Type','Urgency','Status','Date'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} onClick={() => openCall(lead.id)}>
                  <td style={{ fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>{lead.name || 'Unknown'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-3)' }}>{lead.phone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
                  <td>{lead.urgency === 'emergency' ? <StatusBadge status="emergency" /> : <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>—</span>}</td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--text-3)' }}>
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  )
}
