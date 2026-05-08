'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { api } from '../../lib/api'

function StatCard({ label, value, sub, accent, delay }) {
  return (
    <div style={{
      background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12,
      padding: '22px 24px', position: 'relative', overflow: 'hidden',
      animation: `fadeUp 0.35s ease ${delay}s forwards`, opacity: 0,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2D3F5A', marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 500, color: '#DDE4F0', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#4A6080', marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

export default function OverviewPage() {
  const [stats, setStats] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.overview(), api.leads(null, 1)])
      .then(([s, l]) => { setStats(s); setLeads(l.leads || []) })
      .catch(() => setError('Could not connect to backend'))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Shell>
      <div style={{ marginBottom: 32, animation: 'fadeUp 0.35s ease forwards' }}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#2563EB', marginBottom: 8 }}>{today}</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#DDE4F0', letterSpacing: '-0.03em' }}>Good morning ☀️</h1>
        <p style={{ fontSize: 13, color: '#4A6080', marginTop: 4 }}>Here is what is happening with Cool Air HVAC.</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#F87171' }}>
          ⚠ {error} — Make sure the backend is running on Render.
        </div>
      )}

      {loading ? <Loader text="Fetching stats..." /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 36 }}>
            <StatCard label="Calls Today"      value={stats?.calls_today ?? 0}     sub="Inbound calls"      accent="#2563EB" delay={0.05} />
            <StatCard label="Total Leads"      value={stats?.total_leads ?? 0}     sub="All time"           accent="#8B5CF6" delay={0.10} />
            <StatCard label="Jobs Booked"      value={stats?.leads_booked ?? 0}    sub="Converted"          accent="#10B981" delay={0.15} />
            <StatCard label="Conversion"       value={stats?.conversion_rate ?? '0%'} sub="Leads to bookings" accent="#F59E0B" delay={0.20} />
          </div>

          {/* Recent Leads */}
          <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, overflow: 'hidden', animation: 'fadeUp 0.35s ease 0.25s forwards', opacity: 0 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1A2740', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#DDE4F0' }}>Recent Leads</div>
                <div style={{ fontSize: 11, color: '#2D3F5A', marginTop: 3 }}>Latest callers handled by Sarah</div>
              </div>
              <a href="/leads" style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontFamily: 'DM Mono, monospace' }}>View all →</a>
            </div>
            {leads.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#2D3F5A', fontSize: 13 }}>
                No leads yet — Sarah will populate this once calls come in.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Phone', 'Job Type', 'Status', 'Last Contact'].map(h => (
                      <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2D3F5A', borderBottom: '1px solid #1A2740' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 8).map(lead => (
                    <tr key={lead.id} style={{ borderBottom: '1px solid #1A2740' }}>
                      <td style={{ padding: '13px 24px', fontSize: 13, color: '#DDE4F0', fontWeight: 600 }}>{lead.name || '—'}</td>
                      <td style={{ padding: '13px 24px', fontSize: 12, color: '#4A6080', fontFamily: 'DM Mono, monospace' }}>{lead.phone}</td>
                      <td style={{ padding: '13px 24px', fontSize: 12, color: '#4A6080', textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
                      <td style={{ padding: '13px 24px' }}><StatusBadge status={lead.status} /></td>
                      <td style={{ padding: '13px 24px', fontSize: 11, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>
                        {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}
