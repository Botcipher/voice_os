const palette = {
  new:         ['rgba(234,179,8,.13)',  '#EAB308', 'rgba(234,179,8,.3)'],
  contacted:   ['rgba(59,130,246,.13)', '#60A5FA', 'rgba(59,130,246,.3)'],
  qualified:   ['rgba(139,92,246,.13)','#A78BFA', 'rgba(139,92,246,.3)'],
  booked:      ['rgba(34,197,94,.13)',  '#4ADE80', 'rgba(34,197,94,.3)'],
  lost:        ['rgba(239,68,68,.13)',  '#F87171', 'rgba(239,68,68,.3)'],
  answered:    ['rgba(34,197,94,.13)',  '#4ADE80', 'rgba(34,197,94,.3)'],
  missed:      ['rgba(239,68,68,.13)',  '#F87171', 'rgba(239,68,68,.3)'],
  failed:      ['rgba(239,68,68,.13)',  '#F87171', 'rgba(239,68,68,.3)'],
  rescheduled: ['rgba(59,130,246,.13)', '#60A5FA', 'rgba(59,130,246,.3)'],
  cancelled:   ['rgba(239,68,68,.13)',  '#F87171', 'rgba(239,68,68,.3)'],
  completed:   ['rgba(34,197,94,.13)',  '#4ADE80', 'rgba(34,197,94,.3)'],
  emergency:   ['rgba(239,68,68,.18)',  '#FCA5A5', 'rgba(239,68,68,.4)'],
  ai:          ['rgba(139,92,246,.13)','#A78BFA', 'rgba(139,92,246,.3)'],
  human:       ['rgba(59,130,246,.13)', '#60A5FA', 'rgba(59,130,246,.3)'],
  normal:      ['rgba(75,85,99,.13)',   '#9CA3AF', 'rgba(75,85,99,.3)'],
}

export default function StatusBadge({ status }) {
  const key = (status || 'new').toLowerCase()
  const [bg, text, border] = palette[key] || palette.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 600,
      fontFamily: 'DM Mono, monospace',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      background: bg, color: text,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>
      {key}
    </span>
  )
}
