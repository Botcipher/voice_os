'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import Loader from '../../components/Loader'
import { api } from '../../lib/api'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const inp = {
  background: '#111B30', border: '1px solid #1A2740', borderRadius: 8,
  color: '#DDE4F0', fontFamily: 'DM Mono, monospace', fontSize: 13,
  padding: '10px 14px', width: '100%', outline: 'none',
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#0D1526', border: '1px solid #1A2740', borderRadius: 12, padding: 28, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#DDE4F0', marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid #1A2740', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, help, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>{label}</label>
      {children}
      {help && <div style={{ fontSize: 11, color: '#2D3F5A', marginTop: 5, lineHeight: 1.5 }}>{help}</div>}
    </div>
  )
}

export default function SettingsPage() {
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [kwInput, setKwInput] = useState('')

  useEffect(() => {
    api.settings().then(setS).catch(() => setError('Failed to load settings'))
  }, [])

  const set = (key, val) => setS(prev => ({ ...prev, [key]: val }))

  const addKeyword = () => {
    const kw = kwInput.trim().toLowerCase()
    if (!kw) return
    set('emergency_keywords', [...(s.emergency_keywords || []), kw])
    setKwInput('')
  }

  const removeKeyword = (i) => {
    set('emergency_keywords', s.emergency_keywords.filter((_, j) => j !== i))
  }

  const toggleDay = (day) => {
    const days = s.working_days || []
    set('working_days', days.includes(day) ? days.filter(d => d !== day) : [...days, day])
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await api.updateSettings(s)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save — check backend is running')
    } finally {
      setSaving(false)
    }
  }

  if (!s && !error) return (
    <Shell title="Settings" subtitle="Configure your agent and business"><Loader text="Loading settings..." /></Shell>
  )

  if (error && !s) return (
    <Shell title="Settings">
      <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '16px 20px', color: '#F87171', fontSize: 13 }}>⚠ {error}</div>
    </Shell>
  )

  return (
    <Shell title="Settings" subtitle="Changes here update Sarah's behaviour in real time">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* LEFT */}
        <div>
          <Section title="Business Info">
            <Field label="Business Name" help="Sarah introduces herself using this name on every call">
              <input style={inp} value={s.business_name || ''} onChange={e => set('business_name', e.target.value)} />
            </Field>
            <Field label="Business Email">
              <input style={inp} type="email" value={s.business_email || ''} onChange={e => set('business_email', e.target.value)} />
            </Field>
            <Field label="Business Phone">
              <input style={inp} value={s.business_phone || ''} onChange={e => set('business_phone', e.target.value)} placeholder="+1234567890" />
            </Field>
            <Field label="Notification Email" help="Where booking alerts and complaint flags are sent">
              <input style={inp} type="email" value={s.notify_email || ''} onChange={e => set('notify_email', e.target.value)} />
            </Field>
            <Field label="Timezone">
              <select style={{ ...inp, cursor: 'pointer' }} value={s.timezone || 'America/New_York'} onChange={e => set('timezone', e.target.value)}>
                {['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','Europe/London','Africa/Lagos','Africa/Accra'].map(tz => (
                  <option key={tz} value={tz}>{tz.replace('_',' ')}</option>
                ))}
              </select>
            </Field>
          </Section>
        </div>

        {/* RIGHT */}
        <div>
          <Section title="Appointment Config">
            <Field label="Slot Duration (minutes)" help="How long each service appointment slot lasts">
              <input style={inp} type="number" min={15} max={240} value={s.slot_duration_minutes || 60} onChange={e => set('slot_duration_minutes', parseInt(e.target.value))} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Hours Start">
                <input style={inp} type="time" value={s.working_hours_start || '08:00'} onChange={e => set('working_hours_start', e.target.value)} />
              </Field>
              <Field label="Hours End">
                <input style={inp} type="time" value={s.working_hours_end || '18:00'} onChange={e => set('working_hours_end', e.target.value)} />
              </Field>
            </div>
            <Field label="Emergency Callback (minutes)" help="How quickly the team responds to emergency calls">
              <input style={inp} type="number" min={5} max={120} value={s.emergency_callback_minutes || 30} onChange={e => set('emergency_callback_minutes', parseInt(e.target.value))} />
            </Field>
            <Field label="Google Calendar ID" help="The calendar Sarah books appointments into">
              <input style={inp} value={s.calendar_id || ''} onChange={e => set('calendar_id', e.target.value)} placeholder="your@gmail.com" />
            </Field>
          </Section>
        </div>

        {/* WORKING DAYS — full width */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Section title="Working Days">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DAYS.map(day => {
                const on = (s.working_days || []).includes(day)
                return (
                  <button key={day} onClick={() => toggleDay(day)} style={{
                    padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'Syne, sans-serif',
                    background: on ? 'rgba(37,99,235,0.15)' : 'transparent',
                    color: on ? '#60A5FA' : '#4A6080',
                    border: on ? '1px solid rgba(37,99,235,0.4)' : '1px solid #1A2740',
                  }}>{day}</button>
                )
              })}
            </div>
          </Section>
        </div>

        {/* EMERGENCY KEYWORDS — full width */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Section title="Emergency Keywords">
            <p style={{ fontSize: 12, color: '#4A6080', marginBottom: 18, lineHeight: 1.6 }}>
              If a caller mentions any of these words, Sarah immediately treats the call as an emergency — regardless of which node she is in.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, minHeight: 36 }}>
              {(s.emergency_keywords || []).map((kw, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20 }}>
                  <span style={{ fontSize: 11, color: '#FCA5A5', fontFamily: 'DM Mono, monospace' }}>{kw}</span>
                  <button onClick={() => removeKeyword(i)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                style={{ ...inp, flex: 1 }}
                placeholder="Type a keyword and press Enter or Add"
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKeyword()}
              />
              <button onClick={addKeyword} style={{ padding: '10px 20px', background: '#111B30', border: '1px solid #1A2740', borderRadius: 8, color: '#8899AA', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
          </Section>
        </div>

      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved  && <span style={{ fontSize: 12, color: '#4ADE80', fontFamily: 'DM Mono, monospace' }}>✓ Saved successfully</span>}
        {error  && <span style={{ fontSize: 12, color: '#F87171', fontFamily: 'DM Mono, monospace' }}>⚠ {error}</span>}
      </div>
    </Shell>
  )
}
