'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../context/auth'
import { useSettings } from '../context/settings'

const nav = [
  { href: '/overview',     label: 'Overview'      },
  { href: '/leads',        label: 'Leads'          },
  { href: '/calls',        label: 'Calls'          },
  { href: '/appointments', label: 'Appointments'   },
  { href: '/settings',     label: 'Settings'       },
]

export default function Sidebar() {
  const path = usePathname()
  const { logout } = useAuth()
  const { settings } = useSettings()

  const bizName = settings?.business_name || '—'

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minHeight: '100vh',
      background: '#fff',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0, left: 0,
      zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{ padding: '18px 18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          {bizName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
          Lead OS
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map(item => {
          const active = path?.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block',
              padding: '7px 10px',
              borderRadius: 5,
              textDecoration: 'none',
              background: active ? 'var(--bg-inset)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              transition: 'all 0.1s',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-subtle)'; if (!active) e.currentTarget.style.color = 'var(--text-2)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; if (!active) e.currentTarget.style.color = 'var(--text-3)' }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
        <button onClick={logout} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--text-4)', fontFamily: 'Inter, sans-serif',
          padding: 0, letterSpacing: '-0.01em',
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-4)'}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
