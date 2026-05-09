import './globals.css'
import { AuthProvider } from '../context/auth'
import { SettingsProvider } from '../context/settings'
import AuthGuard from '../components/AuthGuard'

export const metadata = {
  title: 'Dashboard',
  description: 'Voice Lead OS',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AuthGuard>
            <SettingsProvider>
              {children}
            </SettingsProvider>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  )
}
