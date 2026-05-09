'use client'
import { useAuth } from '../context/auth'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Loader from './Loader'

export default function AuthGuard({ children }) {
  const { authed, checked } = useAuth()
  const router = useRouter()
  const path = usePathname()

  useEffect(() => {
    if (checked && !authed && path !== '/login') router.replace('/login')
  }, [authed, checked, path, router])

  if (!checked) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff' }}>
      <Loader />
    </div>
  )

  if (!authed && path !== '/login') return null
  return children
}
