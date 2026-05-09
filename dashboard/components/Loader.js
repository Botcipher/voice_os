export default function Loader({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 72, gap: 10 }}>
      <div className="spinner" style={{ width: 18, height: 18, border: '1.5px solid var(--border)', borderTopColor: 'var(--text)', borderRadius: '50%' }} />
      <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{text}</span>
    </div>
  )
}
