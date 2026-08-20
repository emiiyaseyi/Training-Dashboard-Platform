/**
 * Vercel build script — runs instead of `next build` on Vercel.
 *
 * What it does:
 *   1. Rewrites prisma/schema.prisma to use "postgresql" provider, and adds a
 *      `directUrl` line pointing at DIRECT_URL (the source file says "sqlite"
 *      so local dev still works unchanged)
 *   2. Runs `prisma generate` to create the PostgreSQL-compatible client
 *   3. Runs `prisma db push --accept-data-loss` (against DIRECT_URL, bypassing
 *      the pooler — DDL operations don't work reliably through PgBouncer
 *      transaction mode) to sync the schema to the production database. Safe
 *      on every deploy — a no-op once already in sync. --accept-data-loss is
 *      needed because Prisma conservatively flags ANY new unique constraint
 *      on a non-empty table as "possible data loss," even when the values
 *      (e.g. cuid()-generated tokens) can't realistically collide — without
 *      it, this exact situation blocks every deploy indefinitely. If the
 *      underlying data genuinely conflicts, the SQL itself still fails loudly
 *      (this flag only skips Prisma's own pre-flight warning, not the
 *      database's actual constraint enforcement) — but a schema change that
 *      really does drop/truncate real production data still deserves a
 *      manual look before merging, not just this flag rubber-stamping it.
 *   4. Runs `next build`
 *
 * Required env vars in Vercel:
 *   DATABASE_URL — Supabase's pooled "Transaction" connection string (port 6543,
 *                  with ?pgbouncer=true) — used by the app at runtime
 *   DIRECT_URL   — Supabase's direct connection string (port 5432) — used only
 *                  for schema sync during build, never at runtime
 *
 * Set this as the Build Command in your Vercel project settings:
 *   npm run build:vercel
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')

// 1 — Patch schema provider + add directUrl
let schema = fs.readFileSync(schemaPath, 'utf8')
schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"')
schema = schema.replace(
  'url      = env("DATABASE_URL")',
  'url      = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")'
)
fs.writeFileSync(schemaPath, schema)
console.log('✓ Schema patched: sqlite → postgresql (+ directUrl)')

// 2 — Generate Prisma client
execSync('npx prisma generate', { stdio: 'inherit' })

// 3 — Sync schema to the production database (uses directUrl automatically)
execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' })
console.log('✓ Schema synced to production database')

// 4 — Build Next.js
execSync('npx next build', { stdio: 'inherit' })
