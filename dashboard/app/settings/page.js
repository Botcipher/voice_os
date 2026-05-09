'use client'
import { useState, useEffect } from 'react'
import Shell from '../../components/Shell'
import Loader from '../../components/Loader'
import { useSettings } from '../../context/settings'
import { api } from '../../lib/api'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const TIMEZONES = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','Europe/London','Africa/Lagos','Africa/Accra']

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: 22, marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, help, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', marginBottom: 5, letterSpacing: '-0.01em' }}>
        {label}
      </label>
      {children}
      {help && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5, letterSpacing: '-0.01em' }}>{help}</div>}
    </div>
  )
}

export default function SettingsPage() {
  const { setSettings: setGlobalSettings } = useSettings()
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

  const removeKeyword = (i) => set('emergency_keywords', s.emergency_keywords.filter((_,j) => j !== i))

  const toggleDay = (day) => {
    const days = s.working_days || []
    set('working_days', days.includes(day) ? days.filter(d => d !== day) : [...days, day])
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await api.updateSettings(s)
      setGlobalSettings(s)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Failed to save — check backend connection')
    } finally {
      setSaving(false)
    }
  }

  if (!s && !error) return <Shell title="Settings"><Loader /></Shell>

  if (error && !s) return (
    <Shell title="Settings">
      <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
    </Shell>
  )

  return (
    <Shell
      title="Settings"
      subtitle="Changes update your agent's behaviour in real time"
      action={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved  && <span style={{ fontSize: 11.5, color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>✓ Saved</span>}
          {error  && <span style={{ fontSize: 11.5, color: 'var(--red)',   fontFamily: 'JetBrains Mono, monospace' }}>⚠ {error}</span>}
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Left */}
        <div>
          <Section title="Business Info">
            <Field label="Business Name" help="Shown in the sidebar and used by your agent">
              <input value={s.business_name || ''} onChange={e => set('business_name', e.target.value)} />
            </Field>
            <Field label="Agent Name" help="The name your agent uses when answering calls">
              <input value={s.agent_name || ''} onChange={e => set('agent_name', e.target.value)} placeholder="e.g. Sarah" />
            </Field>
            <Field label="Business Email">
              <input type="email" value={s.business_email || ''} onChange={e => set('business_email', e.target.value)} />
            </Field>
            <Field label="Business Phone">
              <input value={s.business_phone || ''} onChange={e => set('business_phone', e.target.value)} placeholder="+1234567890" />
            </Field>
            <Field label="Notification Email" help="Where booking alerts and summaries are sent">
              <input type="email" value={s.notify_email || ''} onChange={e => set('notify_email', e.target.value)} />
            </Field>
            <Field label="Timezone">
              <select value={s.timezone || 'America/New_York'} onChange={e => set('timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
          </Section>
        </div>

        {/* Right */}
        <div>
          <Section title="Appointment Config">
            <Field label="Slot Duration (minutes)">
              <input type="number" min={15} max={240} value={s.slot_duration_minutes || 60} onChange={e => set('slot_duration_minutes', parseInt(e.target.value))} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Start Time">
                <input type="time" value={s.working_hours_start || '08:00'} onChange={e => set('working_hours_start', e.target.value)} />
              </Field>
              <Field label="End Time">
                <input type="time" value={s.working_hours_end || '18:00'} onChange={e => set('working_hours_end', e.target.value)} />
              </Field>
            </div>
            <Field label="Emergency Callback (minutes)" help="How fast your team responds to emergencies">
              <input type="number" min={5} max={120} value={s.emergency_callback_minutes || 30} onChange={e => set('emergency_callback_minutes', parseInt(e.target.value))} />
            </Field>
            <Field label="Google Calendar ID">
              <input value={s.calendar_id || ''} onChange={e => set('calendar_id', e.target.value)} placeholder="you@gmail.com" />
            </Field>
          </Section>
        </div>

        {/* Working Days - full width */}
        <div style={{ gridColumn: '1/-1' }}>
          <Section title="Working Days">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map(day => {
                const on = (s.working_days || []).includes(day)
                return (
                  <button key={day} onClick={() => toggleDay(day)} style={{
                    padding: '6px 14px', borderRadius: 5, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.1s', fontFamily: 'Inter, sans-serif',
                    letterSpacing: '-0.01em',
                    background: on ? 'var(--text)' : 'transparent',
                    color: on ? '#fff' : 'var(--text-3)',
                    border: `1px solid ${on ? 'var(--text)' : 'var(--border)'}`,
                  }}>
                    {day.slice(0,3)}
                  </button>
                )
              })}
            </div>
          </Section>
        </div>

        {/* Emergency Keywords - full width */}
        <div style={{ gridColumn: '1/-1' }}>
          <Section title="Emergency Keywords">
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6, letterSpacing: '-0.01em' }}>
              If a caller mentions any of these words, your agent immediately treats the call as an emergency.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 28 }}>
              {(s.emergency_keywords || []).map((kw, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 4 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>{kw}</span>
                  <button onClick={() => removeKeyword(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Add a keyword and press Enter" value={kwInput} onChange={e => setKwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} style={{ flex: 1 }} />
              <button onClick={addKeyword} className="btn" style={{ whiteSpace: 'nowrap' }}>Add</button>
            </div>
          </Section>
        </div>

      </div>
    </Shell>
  )
}
