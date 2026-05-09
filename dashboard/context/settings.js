'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    business_name: '',
    agent_name: 'Sarah',
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.settings()
      .then(s => { if (s) setSettings(s) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loaded, setSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
