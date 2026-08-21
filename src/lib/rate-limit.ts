import { NextRequest, NextResponse } from 'next/server'

// Lightweight, in-memory, per-instance rate limiter for the handful of routes that are reachable
// without a session (auth lookup, public survey links). Not distributed — on Vercel each warm
// serverless instance keeps its own counters, and a cold start resets them — but it still blocks
// the common case (a script hammering one endpoint against one warm instance) with zero added
// infra. If this app ever needs limits that hold under multi-instance scale, swap this for a
// shared store (e.g. Upstash Redis) — the call sites below wouldn't need to change shape.
const buckets = new Map<string, { count: number; resetAt: number }>()

// Buckets are only ever added to, never proactively cleaned — bounded in practice because the
// keyspace is small (route name x client IP) and each entry expires (gets overwritten) the next
// time that same client hits that same route after its window passes.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// Returns a 429 response if this client has exceeded `limit` requests to `routeKey` within
// `windowMs`, otherwise null (caller proceeds normally).
export function rateLimit(req: NextRequest, routeKey: string, limit: number, windowMs: number): NextResponse | null {
  const key = `${routeKey}:${clientIp(req)}`
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  bucket.count++
  if (bucket.count > limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests — please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }
  return null
}
