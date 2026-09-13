import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'
import { hasAccess, HR_UNIT_KEYS } from '@/lib/permissions'

// Edge-safe base config (no Prisma/bcrypt here — those live in auth.ts, which pulls this in).
// Kept separate so middleware.ts can run the `authorized` check without bundling Node-only
// dependencies into the Edge runtime. permissions.ts is pure logic (no Node-only deps), so it's
// safe to import here too.
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isApi = nextUrl.pathname.startsWith('/api/')
      const isLoginPage = nextUrl.pathname.startsWith('/login')

      if (isLoginPage) {
        // An already-authenticated visit to /login (a stale bookmark, a mobile homescreen
        // shortcut saved before HR existed, clicking a login link while still signed in) used to
        // hard-redirect to '/' unconditionally — sending every such visit straight to Learning
        // Intelligence regardless of the user's real HR access, and entirely bypassing the
        // login page's own HR-priority logic (that page's code never even runs here, since this
        // redirect happens first, in middleware). Apply the exact same priority here instead.
        if (isLoggedIn) {
          const perms = auth?.user?.permissions as Record<string, string> | undefined
          const isSuperAdmin = !!auth?.user?.isSuperAdmin
          const canSeeHr = isSuperAdmin || hasAccess(perms?.['hr-summary'], 'view') || HR_UNIT_KEYS.some((k) => hasAccess(perms?.[k], 'view'))
          return Response.redirect(new URL(canSeeHr ? '/hr' : '/', nextUrl))
        }
        return true
      }
      if (!isLoggedIn) {
        if (isApi) return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
        return false
      }
      return true
    },
    // jwt/session enrichment callbacks live in auth.ts, not here — they need Prisma to refresh
    // custom fields (e.g. after a password change), and Prisma isn't Edge-safe. Middleware only
    // needs `authorized` above, which just checks whether a session exists.
  },
} satisfies NextAuthConfig
