/**
 * Exports all data from the local SQLite database to migration-data.json,
 * for scripts/migrate-import.js to load into production.
 *
 * Run with: node scripts/migrate-export.js
 * (uses your normal local .env.local — no setup needed, run as-is)
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const outPath = path.join(__dirname, '..', 'migration-data.json')

async function main() {
  const data = {
    businessUnits: await prisma.businessUnit.findMany(),
    businessUnitYearConfigs: await prisma.businessUnitYearConfig.findMany(),
    trainingTypes: await prisma.trainingType.findMany(),
    capabilities: await prisma.differentiatingCapability.findMany(),
    talentMemberConfigs: await prisma.talentMemberConfig.findMany(),
    uploadBatches: await prisma.uploadBatch.findMany(),
    trainingRecords: await prisma.trainingRecord.findMany(),
    feedbackRecords: await prisma.feedbackRecord.findMany(),
    subscriptionRecords: await prisma.subscriptionRecord.findMany(),
    kssRecords: await prisma.kSSRecord.findMany(),
    groupCostDistributions: await prisma.groupCostDistribution.findMany(),
    historicalSnapshots: await prisma.historicalSnapshot.findMany(),
    narrativeReports: await prisma.narrativeReport.findMany(),
    monthlyReports: await prisma.monthlyReport.findMany(),
  }

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2))

  console.log('✓ Exported to', outPath)
  console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])))
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
