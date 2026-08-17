import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${reportSerif.variable}`} suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-slate-50 font-sans" suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
