import './globals.css'

export const metadata = {
  title: 'Cool Air HVAC — Dashboard',
  description: 'Voice Lead Operating System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
