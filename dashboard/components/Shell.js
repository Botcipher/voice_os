import Sidebar from './Sidebar'

export default function Shell({ children, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-subtle)' }}>
      <Sidebar />
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        flex: 1,
        padding: '32px 36px',
        minHeight: '100vh',
        maxWidth: '100%',
      }}>
        {(title || action) && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
            animation: 'fadeUp 0.22s ease forwards',
          }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
                {title}
              </h1>
              {subtitle && (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4, letterSpacing: '-0.01em' }}>
                  {subtitle}
                </p>
              )}
            </div>
            {action && <div>{action}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
