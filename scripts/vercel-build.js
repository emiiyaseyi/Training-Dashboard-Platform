/**
 * Vercel build script — runs instead of `next build` on Vercel.
 *
 * What it does:
 *   1. Rewrites prisma/schema.prisma to use "postgresql" provider
 *      (the source file says "sqlite" so local dev still works)
 *   2. Runs `prisma generate` to create the PostgreSQL-compatible client
 *   3. Runs `next build`
 *
 * Set this as the Build Command in your Vercel project settings:
 *   node scripts/vercel-build.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')

// 1 — Patch schema provider
let schema = fs.readFileSync(schemaPath, 'utf8')
schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"')
fs.writeFileSync(schemaPath, schema)
console.log('✓ Schema patched: sqlite → postgresql')

// 2 — Generate Prisma client
execSync('npx prisma generate', { stdio: 'inherit' })

// 3 — Build Next.js
execSync('npx next build', { stdio: 'inherit' })
