/**
 * Seeds the two super admin accounts (MSL-0218, MSL-0176) directly into the production
 * PostgreSQL database. Safe to re-run (upserts).
 *
 * Setup: put your Supabase DIRECT connection string (port 5432 — the "session mode" one,
 * not the pooled 6543 one) into .env.production.local as PROD_DATABASE_URL. That file is
 * gitignored and never leaves your machine. Same string you used for the earlier data
 * migration — grab it again from Supabase → Connect → ORM (Prisma) tab if you no longer
 * have it locally.
 *
 * Run with: node scripts/seed-admins-prod.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const envLocalProdPath = path.join(__dirname, '..', '.env.production.local')

const SUPER_ADMINS = [
  { staffId: 'MSL-0218', name: 'Super Admin (MSL-0218)' },
  { staffId: 'MSL-0176', name: 'Super Admin (MSL-0176)' },
]

function loadProdUrl() {
  if (!fs.existsSync(envLocalProdPath)) {
    throw new Error('.env.production.local not found. Create it with a line: PROD_DATABASE_URL="postgresql://...:5432/postgres"')
  }
  const raw = fs.readFileSync(envLocalProdPath, 'utf8')
  const match = raw.match(/^PROD_DATABASE_URL=["']?(.+?)["']?\s*$/m)
  if (!match) throw new Error('PROD_DATABASE_URL not found in .env.production.local')
  const url = match[1]
  if (url.includes('PROJECT_REF') || url.includes('PASSWORD') || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('.env.production.local still has a placeholder value, not a real connection string — open the file and replace it with your actual Supabase direct connection string (starts with postgresql://).')
  }
  return url
}

async function run() {
  const prodUrl = loadProdUrl()

  const originalSchema = fs.readFileSync(schemaPath, 'utf8')
  const patchedSchema = originalSchema.replace('provider = "sqlite"', 'provider = "postgresql"')
  fs.writeFileSync(schemaPath, patchedSchema)
  console.log('✓ Schema patched: sqlite → postgresql')

  try {
    execSync('npx prisma generate', { stdio: 'inherit' })

    process.env.DATABASE_URL = prodUrl
    Object.keys(require.cache).forEach((k) => { if (k.includes('@prisma/client') || k.includes('bcryptjs')) delete require.cache[k] })
    const { PrismaClient } = require('@prisma/client')
    const bcrypt = require('bcryptjs')
    const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } })

    try {
      for (const admin of SUPER_ADMINS) {
        const passwordHash = await bcrypt.hash(admin.staffId, 10)
        const user = await prisma.user.upsert({
          where: { staffId: admin.staffId },
          update: { isSuperAdmin: true, isActive: true },
          create: {
            staffId: admin.staffId,
            name: admin.name,
            isSuperAdmin: true,
            businessUnitScope: 'ALL',
            requiresPassword: true,
            mustChangePassword: true,
            passwordHash,
          },
        })
        console.log(`✓ ${user.staffId} — login password is "${admin.staffId}" (forced change on first login)`)
      }
    } finally {
      await prisma.$disconnect()
    }
  } finally {
    fs.writeFileSync(schemaPath, originalSchema)
    // On Windows, the query engine's file handle can take a moment to release after
    // $disconnect() — retry a few times instead of letting a transient EPERM here mask
    // whatever real error happened above (a finally-block throw replaces the original one).
    let reverted = false
    for (let attempt = 1; attempt <= 5 && !reverted; attempt++) {
      try {
        execSync('npx prisma generate', { stdio: 'inherit' })
        reverted = true
      } catch (err) {
        if (attempt === 5) {
          console.warn('⚠ Could not regenerate the local Prisma client automatically. Run `npx prisma generate` manually once nothing else is using node.')
        } else {
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
    }
    if (reverted) console.log('✓ Schema reverted: postgresql → sqlite (local dev restored)')
  }
}

run().catch((err) => { console.error(err); process.exit(1) })
