import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeStaffId, normalizeEmail } from '@/lib/permissions'
import { authConfig } from '@/auth.config'
import { logAudit } from '@/lib/audit-log'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Staff ID or Email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const rawIdentifier = typeof credentials?.identifier === 'string' ? credentials.identifier : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        const idAsStaffId = normalizeStaffId(rawIdentifier)
        const idAsEmail = normalizeEmail(rawIdentifier)
        if (!idAsStaffId && !idAsEmail) return null

        const user = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [
              ...(idAsStaffId ? [{ staffId: idAsStaffId }] : []),
              ...(idAsEmail ? [{ email: idAsEmail }] : []),
            ],
          },
          include: { permissions: true },
        })
        if (!user) {
          await logAudit({ action: 'login_failure', detail: `Unknown identifier: ${rawIdentifier}` })
          return null
        }

        if (user.requiresPassword) {
          if (!password || !user.passwordHash) {
            await logAudit({ userId: user.id, userName: user.name, userEmail: user.email, action: 'login_failure', detail: 'No password provided.' })
            return null
          }
          const valid = await bcrypt.compare(password, user.passwordHash)
          if (!valid) {
            await logAudit({ userId: user.id, userName: user.name, userEmail: user.email, action: 'login_failure', detail: 'Incorrect password.' })
            return null
          }
        }

        await logAudit({ userId: user.id, userName: user.name, userEmail: user.email, action: 'login_success' })
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          staffId: user.staffId,
          isSuperAdmin: user.isSuperAdmin,
          businessUnitScope: user.businessUnitScope,
          mustChangePassword: user.mustChangePassword,
          permissions: Object.fromEntries(user.permissions.map((p) => [p.page, p.level])),
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.staffId = user.staffId
        token.isSuperAdmin = user.isSuperAdmin
        token.businessUnitScope = user.businessUnitScope
        token.mustChangePassword = user.mustChangePassword
        token.permissions = user.permissions
      } else if (trigger === 'update' && token.id) {
        // Re-read from the DB so a password change or admin-side permission edit takes effect
        // immediately, without needing a full sign-out/sign-in.
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { permissions: true },
        })
        if (fresh) {
          token.staffId = fresh.staffId
          token.isSuperAdmin = fresh.isSuperAdmin
          token.businessUnitScope = fresh.businessUnitScope
          token.mustChangePassword = fresh.mustChangePassword
          token.permissions = Object.fromEntries(fresh.permissions.map((p) => [p.page, p.level]))
        }
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
        // Read fresh from the DB on every session check, not the JWT's cached copy — otherwise an
        // admin granting/changing someone's permission while they're already logged in has no
        // effect until that person signs out and back in (confirmed case: two users granted admin
        // on an HR unit didn't see the Admin button until told to re-login). permissions is the
        // one piece of the token that changes from outside the owning user's own session (every
        // other token field only ever changes via that user's own sign-in or self-service update),
        // so it's the one worth a per-request lookup; isSuperAdmin/businessUnitScope etc. stay on
        // the cheaper JWT-cached path above.
        try {
          const fresh = await prisma.user.findUnique({ where: { id: token.id as string }, include: { permissions: true } })
          session.user.permissions = fresh ? Object.fromEntries(fresh.permissions.map((p) => [p.page, p.level])) : (token.permissions as Record<string, string>)
        } catch {
          session.user.permissions = token.permissions as Record<string, string>
        }
      }
      return session
    },
  },
})
