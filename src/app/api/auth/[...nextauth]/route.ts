import { NextRequest } from 'next/server'
import { handlers } from '@/auth'
import { rateLimit } from '@/lib/rate-limit'

export const { GET } = handlers

// The actual credentials sign-in path — NextAuth's own authorize() callback (in auth.ts) has no
// direct access to the request to rate-limit itself, so it's done here instead, one layer up,
// scoped to just this sub-path (not every /api/auth/* call, e.g. session/csrf polling).
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const limited = rateLimit(req, 'login', 10, 60_000)
    if (limited) return limited
  }
  return handlers.POST(req)
}
