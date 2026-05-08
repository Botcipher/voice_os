'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/overview',     label: 'Overview',     icon: '⬡' },
  { href: '/leads',        label: 'Leads',        icon: '◎' },
  { href: '/calls',        label: 'Calls',        icon: '◌' },
  { href: '/appointments', label: 'Appointments', icon: '◈' },
  { href: '/settings',     label: 'Settings',     icon: '⊙' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{
      width: 216,
      minHeight: '100vh',
      background: '#0A1120',
      borderRight: '1px solid #151F35',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 0',
      position: 'fixed',
      top: 0, left: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 28px', borderBottom: '1px solid #151F35', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
          }}>❄</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DDE4F0', letterSpacing: '-0.01em' }}>Cool Air</div>
            <div style={{ fontSize: 10, color: '#2563EB', fontFamily: 'DM Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>HVAC</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map(item => {
          const active = path?.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              textDecoration: 'none',
              background: active ? 'rgba(37,99,235,0.12)' : 'transparent',
              border: `1px solid ${active ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
              color: active ? '#60A5FA' : '#4A6080',
              fontSize: 13,
              fontWeight: active ? 700 : 400,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
              {active && (
                <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: '#3B82F6' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #151F35' }}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#2D3F5A', letterSpacing: '0.08em', lineHeight: 1.9 }}>
          VOICE LEAD OS<br />
          <span style={{ color: '#2563EB' }}>v1.0.0 — Sarah</span>
        </div>
      </div>
    </aside>
  )
}
