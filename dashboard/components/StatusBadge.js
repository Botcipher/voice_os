const styles = {
  new:         { bg: '#f5f5f5', color: '#5c5c5c', border: '#e0e0e0' },
  contacted:   { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  qualified:   { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  booked:      { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  lost:        { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  answered:    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  missed:      { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  failed:      { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  ended:       { bg: '#f5f5f5', color: '#5c5c5c', border: '#e0e0e0' },
  rescheduled: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  cancelled:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  completed:   { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  emergency:   { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  ai:          { bg: '#f5f5f5', color: '#5c5c5c', border: '#e0e0e0' },
  human:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  normal:      { bg: '#f5f5f5', color: '#8c8c8c', border: '#e0e0e0' },
  ongoing:     { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
}

export default function StatusBadge({ status }) {
  const key = (status || 'new').toLowerCase()
  const s = styles[key] || styles.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 4,
      fontSize: 10.5, fontWeight: 500,
      fontFamily: 'JetBrains Mono, monospace',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {key}
    </span>
  )
}
