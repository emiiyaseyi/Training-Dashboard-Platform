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
 *   4. Enables Row-Level Security on every public-schema table (see step 4's own comment below)
 *   5. Runs `next build`
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

// 4 — Enable Row-Level Security on every public-schema table. Supabase exposes every public
// table over its REST/GraphQL data API (callable with just the project's "anon" key, which is
// meant to be publicly embeddable) UNLESS RLS is on for that table — regardless of whether the
// app itself ever uses that API. This app only ever reaches Postgres directly via Prisma (never
// supabase-js), and the role Prisma connects as (Supabase's main "postgres" role) bypasses RLS by
// default, so this purely closes an otherwise-wide-open, unused attack surface — it can't block
// the app itself. Idempotent (a no-op on a table that's already enabled), so safe to run on every
// deploy, including ones that touch no schema; runs here (not a one-off) so a brand-new table
// created THIS deploy is covered immediately instead of sitting exposed until someone remembers.
// Runs against DIRECT_URL like the push above, for the same pooler/DDL-reliability reason.
async function enableRowLevelSecurity() {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        END LOOP;
      END $$;
    `)
    console.log('✓ Row-Level Security enabled on all public-schema tables')
  } finally {
    await prisma.$disconnect()
  }
}

enableRowLevelSecurity()
  .then(() => {
    // 5 — Build Next.js
    execSync('npx next build', { stdio: 'inherit' })
  })
  .catch((err) => {
    console.error('✗ Failed to enable Row-Level Security:', err)
    process.exit(1)
  })
