'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import StatusBadge from '../../components/StatusBadge'
import Loader from '../../components/Loader'
import { useSettings } from '../../context/settings'
import { api } from '../../lib/api'

const AVG_JOB_VALUE = 500
const CLOSE_RATE = 0.20

function StatCard({ label, value, sub, delay = 0 }) {
  return (
    <div className="card" style={{ padding: '18px 20px', animation: `fadeUp 0.22s ease ${delay}s both` }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 10, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.035em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, letterSpacing: '-0.01em' }}>{sub}</div>}
    </div>
  )
}

function RecoveryWidget({ stats, agentName }) {
  const total = stats?.total_leads || 0
  const booked = stats?.leads_booked || 0
  const recovered = Math.round(booked * AVG_JOB_VALUE * CLOSE_RATE * 5)
  const name = agentName || 'Your agent'

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 20, animation: 'fadeUp 0.22s ease 0.1s both' }}>
      <div style={{
        padding: '14px 20px', background: '#0d0d0d',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>Revenue Recovery</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            What {name} is recovering for you
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          All time
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: `Calls handled by ${name}`, value: total,                           sub: 'Total inbound captured' },
          { label: 'Jobs booked',               value: booked,                          sub: `${stats?.conversion_rate || '0%'} conversion`, color: 'var(--green)' },
          { label: 'Revenue recovered',         value: `$${recovered.toLocaleString()}`,sub: `$${AVG_JOB_VALUE} avg × ${CLOSE_RATE*100}% close`, color: 'var(--green)' },
        ].map((m, i) => (
          <div key={i} style={{ padding: '18px 20px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.035em', color: m.color || 'var(--text)', lineHeight: 1 }}>
              {m.value}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, letterSpacing: '-0.01em' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (booked / total) * 100)}%`,
              background: '#0d0d0d', borderRadius: 4,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
            {booked} / {total} converted
          </div>
        </div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const { settings } = useSettings()
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
  const agentName = settings?.agent_name || 'Your agent'

  return (
    <Shell>
      <div style={{ marginBottom: 24, animation: 'fadeUp 0.22s ease forwards' }}>
        <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {today}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.025em' }}>Overview</h1>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: 'var(--red)', letterSpacing: '-0.01em' }}>
          ⚠ {error}
        </div>
      )}

      {loading ? <Loader /> : (
        <>
          <RecoveryWidget stats={stats} agentName={agentName} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            <StatCard label="Calls Today"  value={stats?.calls_today ?? 0}        sub="Inbound"            delay={0.05} />
            <StatCard label="Total Leads"  value={stats?.total_leads ?? 0}        sub="All time"           delay={0.08} />
            <StatCard label="Booked"       value={stats?.leads_booked ?? 0}       sub="Jobs confirmed"     delay={0.11} />
            <StatCard label="Conversion"   value={stats?.conversion_rate ?? '0%'} sub="Leads → bookings"  delay={0.14} />
          </div>

          <div className="card" style={{ overflow: 'hidden', animation: 'fadeUp 0.22s ease 0.18s both' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>Recent Leads</span>
              <a href="/leads" style={{ fontSize: 11.5, color: 'var(--text-3)', textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace' }}>View all →</a>
            </div>
            {leads.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No leads yet — {agentName} will populate this once calls come in.
              </div>
            ) : (
              <table>
                <thead><tr>{['Name','Phone','Job','Status','Date'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {leads.slice(0, 8).map(lead => (
                    <tr key={lead.id} onClick={() => window.location.href='/leads'}>
                      <td style={{ fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>{lead.name || '—'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-3)' }}>{lead.phone}</td>
                      <td style={{ textTransform: 'capitalize' }}>{lead.job_type || '—'}</td>
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
        </>
      )}
    </Shell>
  )
}
