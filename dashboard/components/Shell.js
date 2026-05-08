import Sidebar from './Sidebar'

export default function Shell({ children, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#070C18' }}>
      <Sidebar />
      <main style={{ marginLeft: 216, flex: 1, padding: '36px 44px', minHeight: '100vh' }}>
        {(title || action) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div className="fade-up">
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#DDE4F0', letterSpacing: '-0.02em' }}>{title}</h1>
              {subtitle && <p style={{ fontSize: 13, color: '#4A6080', marginTop: 4 }}>{subtitle}</p>}
            </div>
            {action && <div className="fade-up">{action}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
