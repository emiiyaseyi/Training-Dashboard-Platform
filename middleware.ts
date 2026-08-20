import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // api/cron/* is invoked by Vercel's scheduler (no session cookie) — it authenticates itself
  // via a CRON_SECRET bearer token instead, checked inside the route handler.
  // survey/* and api/survey/* are the public, token-secured forms external respondents (staff,
  // line managers) fill in — they have no platform account, so these must never require login.
  matcher: ['/((?!api/auth|api/cron|api/survey|survey|_next/static|_next/image|favicon.ico).*)'],
}
