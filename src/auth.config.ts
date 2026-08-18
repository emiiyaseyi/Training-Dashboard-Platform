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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.staffId = user.staffId
        token.isSuperAdmin = user.isSuperAdmin
        token.businessUnitScope = user.businessUnitScope
        token.mustChangePassword = user.mustChangePassword
        token.permissions = user.permissions
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.staffId = token.staffId as string | null
        session.user.isSuperAdmin = token.isSuperAdmin as boolean
        session.user.businessUnitScope = token.businessUnitScope as string
        session.user.mustChangePassword = token.mustChangePassword as boolean
        session.user.permissions = token.permissions as Record<string, string>
      }
      return session
    },
  },
} satisfies NextAuthConfig
