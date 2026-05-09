'use client'
import { useState } from 'react'
import { useAuth } from '../../context/auth'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(false)
    const ok = await login(password)
    if (ok) {
      router.replace('/overview')
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 340, padding: '0 24px', animation: 'fadeUp 0.25s ease forwards' }}>

        <div style={{ width: 32, height: 32, background: '#0d0d0d', borderRadius: 7, marginBottom: 28 }} />

        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0d0d0d', letterSpacing: '-0.025em', marginBottom: 4 }}>
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 24, letterSpacing: '-0.01em' }}>
          Enter your password to access the dashboard.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Password field with show/hide toggle */}
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                background: '#fafafa',
                border: `1px solid ${error ? '#dc2626' : '#ebebeb'}`,
                borderRadius: 6,
                color: '#0d0d0d',
                fontSize: 13.5,
                padding: '9px 40px 9px 12px',
                width: '100%',
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
                transition: 'border-color 0.12s',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#8c8c8c',
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                userSelect: 'none',
              }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#dc2626', letterSpacing: '-0.01em' }}>
              Incorrect password. Try again.
            </p>
          )}

          <button type="submit" disabled={loading || !password} style={{
            background: '#0d0d0d', color: '#fff', border: 'none',
            borderRadius: 6, padding: '9px 0',
            fontSize: 13, fontWeight: 500,
            cursor: loading || !password ? 'not-allowed' : 'pointer',
            opacity: loading || !password ? 0.35 : 1,
            fontFamily: 'Inter, sans-serif', transition: 'opacity 0.12s',
            letterSpacing: '-0.01em',
          }}>
            {loading ? 'Signing in...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
