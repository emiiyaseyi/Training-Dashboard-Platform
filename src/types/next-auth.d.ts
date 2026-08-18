import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    staffId: string | null
    email: string | null
    isSuperAdmin: boolean
    businessUnitScope: string
    mustChangePassword: boolean
    permissions: Record<string, string>
  }

  interface Session {
    user: {
      id: string
      staffId: string | null
      isSuperAdmin: boolean
      businessUnitScope: string
      mustChangePassword: boolean
      permissions: Record<string, string>
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    staffId: string | null
    isSuperAdmin: boolean
    businessUnitScope: string
    mustChangePassword: boolean
    permissions: Record<string, string>
  }
}
