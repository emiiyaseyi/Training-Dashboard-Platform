import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/components/auth/AuthProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const reportSerif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-report-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Learning Intelligence Dashboard',
  description: 'Enterprise training & professional development analytics platform',
}

// width/initialScale alone fixed the initial "assumes ~980px desktop layout" zoom-out, but still
// let a pinch-zoom (even a small accidental one) leave the page pannable left/right afterward —
// maximumScale/userScalable locks it so the layout can never be zoomed away from its correctly-
// fitted state in the first place.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${reportSerif.variable}`} suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-slate-50 font-sans" suppressHydrationWarning>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
