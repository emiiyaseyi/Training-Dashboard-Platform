// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/sampleData.ts), unchanged. DEV-ONLY sample data so the dashboard UI works before
// TA_GOOGLE_SHEET_ID/credentials are set — never used in production (see ta-sheets.ts).
// Deterministic (seeded PRNG) so local sessions are reproducible.

import type { DashboardData, HireRecord, OfferStatus, PipelineRecord } from './ta-types'

const BUS = ['Engineering', 'Sales', 'Operations', 'Customer Success', 'Finance']
const OFFICE_TYPES = ['Front Office', 'Back Office']
const ROLES: { name: string; officeType: string }[] = [
  { name: 'Software Engineer', officeType: 'Back Office' },
  { name: 'Sales Executive', officeType: 'Front Office' },
  { name: 'Operations Analyst', officeType: 'Back Office' },
  { name: 'Customer Success Rep', officeType: 'Front Office' },
  { name: 'Financial Analyst', officeType: 'Back Office' },
  { name: 'Product Manager', officeType: 'Back Office' },
  { name: 'QA Engineer', officeType: 'Back Office' },
  { name: 'Relationship Manager', officeType: 'Front Office' },
]
const HIRING_SOURCES = ['Referral', 'LinkedIn', 'Job Board', 'Agency', 'Direct']
const PIPELINE_STAGES = ['Requisition', 'Psychometric Assessment', 'First Level with Hiring Team', 'Second Level with HBUs', 'Offer', 'Medical', 'Resumption']
const STATUSES: OfferStatus[] = ['Accepted', 'Accepted', 'Accepted', 'Declined', 'Pending']

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 86400000)
}

function generateRecords(count: number, rng: () => number, now: Date): HireRecord[] {
  const records: HireRecord[] = []
  for (let i = 0; i < count; i++) {
    const requisitionStartDate = daysAgo(now, Math.floor(rng() * 210) + 30)
    const offerStatus = pick(rng, STATUSES)
    const isAccepted = offerStatus === 'Accepted'
    const role = pick(rng, ROLES)
    const cycleDays = Math.floor(rng() * 45) + 5
    const resumptionDate = isAccepted ? daysAgo(requisitionStartDate, -cycleDays) : null
    const medicalCost = isAccepted ? Math.round((rng() * 8000 + 4000) / 100) * 100 : 0
    const airtimeCost = isAccepted ? Math.round((rng() * 2000 + 500) / 100) * 100 : 0
    const feedingCost = isAccepted ? Math.round((rng() * 5000 + 1000) / 100) * 100 : 0

    records.push({
      id: `sample-${i}`,
      candidateName: `Sample Candidate ${i + 1}`,
      role: role.name,
      bu: pick(rng, BUS),
      officeType: role.officeType,
      hiringSource: pick(rng, HIRING_SOURCES),
      requisitionStartDate,
      offerStatus,
      offerExtendedDate: daysAgo(requisitionStartDate, -Math.floor(rng() * 10 + 2)),
      resumptionDate,
      manualTimeToHireWeeks: isAccepted ? Math.round((cycleDays / 7) * 10) / 10 : null,
      medicalCost,
      airtimeCost,
      feedingCost,
      manualTotalCost: isAccepted ? medicalCost + airtimeCost + feedingCost : null,
    })
  }
  return records.sort((a, b) => a.requisitionStartDate.getTime() - b.requisitionStartDate.getTime())
}

function generatePipeline(count: number, rng: () => number, now: Date): PipelineRecord[] {
  const records: PipelineRecord[] = []
  for (let i = 0; i < count; i++) {
    const requisitionStartDate = daysAgo(now, Math.floor(rng() * 60) + 1)
    const role = pick(rng, ROLES)
    const stageIndex = Math.min(PIPELINE_STAGES.length - 1, Math.floor(rng() * rng() * PIPELINE_STAGES.length * 1.4))
    records.push({
      id: `pipeline-sample-${i}`,
      candidateName: `Pipeline Candidate ${i + 1}`,
      role: role.name,
      bu: pick(rng, BUS),
      officeType: role.officeType,
      hiringSource: pick(rng, HIRING_SOURCES),
      requisitionStartDate,
      currentStage: PIPELINE_STAGES[stageIndex],
    })
  }
  return records
}

export function getSampleTaDashboardData(): DashboardData {
  const rng = mulberry32(42)
  const now = new Date()
  return {
    records: generateRecords(60, rng, now),
    pipeline: generatePipeline(18, rng, now),
    config: {
      bus: BUS,
      roles: ROLES.map((r) => r.name),
      offerStatuses: ['Accepted', 'Declined', 'Pending', 'Withdrawn'],
      officeTypes: OFFICE_TYPES,
      hiringSources: HIRING_SOURCES,
      pipelineStages: PIPELINE_STAGES,
    },
  }
}
