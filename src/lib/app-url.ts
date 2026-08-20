// The platform's own public base URL, used to build links that go out in emails (survey forms).
// Set APP_BASE_URL explicitly in production (your real domain) — Vercel's automatic VERCEL_URL
// is a per-deployment hostname, not your stable custom domain, so it's only a fallback.
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
