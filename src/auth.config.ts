import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'

// Edge-safe base config (no Prisma/bcrypt here — those live in auth.ts, which pulls this in).
// Kept separate so middleware.ts can run the `authorized` check without bundling Node-only
// dependencies into the Edge runtime.
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
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl))
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
