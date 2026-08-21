/**
 * Imports migration-data.json (produced by migrate-export.js) into the production
 * PostgreSQL database, then restores the local schema back to SQLite so `npm run dev`
 * keeps working normally afterward.
 *
 * Setup: put your Supabase DIRECT connection string (port 5432, not the pooled 6543
 * one — bulk inserts need a direct connection) into .env.production.local as
 * PROD_DATABASE_URL. That file is gitignored and never leaves your machine.
 *
 * Run with: node scripts/migrate-import.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const dataPath = path.join(__dirname, '..', 'migration-data.json')
const envLocalProdPath = path.join(__dirname, '..', '.env.production.local')

function loadProdUrl() {
  const raw = fs.readFileSync(envLocalProdPath, 'utf8')
  const match = raw.match(/^PROD_DATABASE_URL=["']?(.+?)["']?\s*$/m)
  if (!match) throw new Error('PROD_DATABASE_URL not found in .env.production.local')
  const url = match[1]
  if (url.includes('PROJECT_REF') || url.includes('PASSWORD')) {
    throw new Error('.env.production.local still has the placeholder value — replace it with your real Supabase direct connection string first.')
  }
  return url
}

async function run() {
  if (!fs.existsSync(dataPath)) {
    throw new Error('migration-data.json not found — run `node scripts/migrate-export.js` first.')
  }
  const prodUrl = loadProdUrl()
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

  // 1 — Patch schema to postgresql (same trick as scripts/vercel-build.js)
  const originalSchema = fs.readFileSync(schemaPath, 'utf8')
  const patchedSchema = originalSchema.replace('provider = "sqlite"', 'provider = "postgresql"')
  fs.writeFileSync(schemaPath, patchedSchema)
  console.log('✓ Schema patched: sqlite → postgresql')

  try {
    execSync('npx prisma generate', { stdio: 'inherit' })

    process.env.DATABASE_URL = prodUrl
    // Clear the require cache so we get a client generated against the patched schema
    Object.keys(require.cache).forEach((k) => { if (k.includes('@prisma/client')) delete require.cache[k] })
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } })

    try {
      console.log('Importing...')

      // Order matters — UploadBatch must exist before records that reference it.
      if (data.businessUnits.length) await prisma.businessUnit.createMany({ data: data.businessUnits, skipDuplicates: true })
      if (data.businessUnitYearConfigs.length) await prisma.businessUnitYearConfig.createMany({ data: data.businessUnitYearConfigs, skipDuplicates: true })
      if (data.trainingTypes.length) await prisma.trainingType.createMany({ data: data.trainingTypes, skipDuplicates: true })
      if (data.capabilities.length) await prisma.differentiatingCapability.createMany({ data: data.capabilities, skipDuplicates: true })
      if (data.vendors?.length) await prisma.vendor.createMany({ data: data.vendors, skipDuplicates: true })
      if (data.talentMemberExemptions?.length) await prisma.talentMemberExemption.createMany({ data: data.talentMemberExemptions, skipDuplicates: true })
      if (data.uploadBatches.length) await prisma.uploadBatch.createMany({ data: data.uploadBatches, skipDuplicates: true })
      if (data.trainingRecords.length) await prisma.trainingRecord.createMany({ data: data.trainingRecords, skipDuplicates: true })
      if (data.feedbackRecords.length) await prisma.feedbackRecord.createMany({ data: data.feedbackRecords, skipDuplicates: true })
      if (data.subscriptionRecords.length) await prisma.subscriptionRecord.createMany({ data: data.subscriptionRecords, skipDuplicates: true })
      if (data.kssRecords.length) await prisma.kSSRecord.createMany({ data: data.kssRecords, skipDuplicates: true })
      if (data.groupCostDistributions.length) await prisma.groupCostDistribution.createMany({ data: data.groupCostDistributions, skipDuplicates: true })
      if (data.historicalSnapshots.length) await prisma.historicalSnapshot.createMany({ data: data.historicalSnapshots, skipDuplicates: true })
      if (data.narrativeReports.length) await prisma.narrativeReport.createMany({ data: data.narrativeReports, skipDuplicates: true })
      if (data.monthlyReports.length) await prisma.monthlyReport.createMany({ data: data.monthlyReports, skipDuplicates: true })

      console.log('✓ Import complete:', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])))
    } finally {
      await prisma.$disconnect()
    }
  } finally {
    // 2 — Always revert schema back to sqlite so local dev keeps working
    fs.writeFileSync(schemaPath, originalSchema)
    execSync('npx prisma generate', { stdio: 'inherit' })
    console.log('✓ Schema reverted: postgresql → sqlite (local dev restored)')
  }
}

run().catch((err) => { console.error(err); process.exit(1) })
