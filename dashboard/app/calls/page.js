'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { api } from '../../lib/api'

export default function CallsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.leads(null, 1)
      .then(d => setLeads(d.leads || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Shell title="Calls" subtitle="Every call Sarah handled — click a row for transcript">
      <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? <Loader text="Fetching calls..." /> : leads.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: '#2D3F5A', fontSize: 13 }}>
            No calls yet. Once Sarah starts handling calls they will appear here.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Caller', 'Phone', 'Job Type', 'Status', 'Last Contact'].map(h => (
                  <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', borderBottom: '1px solid #1A2740' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}
                  onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                  style={{ borderBottom: '1px solid #1A2740', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 24px', fontSize: 13, color: '#DDE4F0', fontWeight: 600 }}>{lead.name || 'Unknown'}</td>
                  <td style={{ padding: '13px 24px', fontSize: 11, color: '#4A6080', fontFamily: 'DM Mono, monospace' }}>{lead.phone}</td>
                  <td style={{ padding: '13px 24px', fontSize: 12, color: '#4A6080', textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
                  <td style={{ padding: '13px 24px' }}><StatusBadge status={lead.status} /></td>
                  <td style={{ padding: '13px 24px', fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>
                    {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: '#2D3F5A', textAlign: 'center', fontFamily: 'DM Mono, monospace' }}>
        Click any row to expand transcript — or go to Leads for the full detail view.
      </div>
    </Shell>
  )
}
