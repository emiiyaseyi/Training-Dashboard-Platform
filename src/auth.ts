import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeStaffId, normalizeEmail } from '@/lib/permissions'
import { authConfig } from '@/auth.config'

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
        if (!user) return null

        if (user.requiresPassword) {
          if (!password || !user.passwordHash) return null
          const valid = await bcrypt.compare(password, user.passwordHash)
          if (!valid) return null
        }

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
        session.user.permissions = token.permissions as Record<string, string>
      }
      return session
    },
  },
})
