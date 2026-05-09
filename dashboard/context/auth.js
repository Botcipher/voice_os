'use client'
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)
const AUTH_KEY = 'vlos_auth_token'

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const token = sessionStorage.getItem(AUTH_KEY)
    if (!token) { setChecked(true); return }

    fetch('/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => { setAuthed(r.ok); setChecked(true) })
      .catch(() => { setAuthed(false); setChecked(true) })
  }, [])

  const login = async (password) => {
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const { token } = await res.json()
        sessionStorage.setItem(AUTH_KEY, token)
        setAuthed(true)
        return true
      }
      return false
    } catch { return false }
  }

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }

  return (
    <AuthContext.Provider value={{ authed, checked, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
