import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // api/cron/* is invoked by Vercel's scheduler (no session cookie) — it authenticates itself
  // via a CRON_SECRET bearer token instead, checked inside the route handler.
  matcher: ['/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)'],
}
