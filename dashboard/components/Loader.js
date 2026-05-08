export default function Loader({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 16 }}>
      <div className="spinner" style={{ width: 28, height: 28, border: '2px solid #1A2740', borderTopColor: '#2563EB', borderRadius: '50%' }} />
      <span style={{ fontSize: 12, color: '#2D3F5A', fontFamily: 'DM Mono, monospace' }}>{text}</span>
    </div>
  )
}
