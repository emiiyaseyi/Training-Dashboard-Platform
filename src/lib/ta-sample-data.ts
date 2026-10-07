// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/sampleData.ts), unchanged. DEV-ONLY sample data so the dashboard UI works before
// TA_GOOGLE_SHEET_ID/credentials are set — never used in production (see ta-sheets.ts).
// Deterministic (seeded PRNG) so local sessions are reproducible.

import type { DashboardData, HireRecord, OfferStatus, PipelineRecord, InternalMobilityRecord, ConversionRecord, NotConvertedRecord, VacancyRecord } from './ta-types'

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
const GRADES = ['Officer', 'Senior Officer', 'Assistant Manager', 'Manager', 'Senior Manager']
const VACANCY_STATUSES = ['Open', 'Filled Internally', 'Filled Externally']
const NOT_CONVERTED_REASONS = ['Declined Offer', 'Performance', 'Role Not Available', 'Resigned Before Decision']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
    const hbuCost = isAccepted && rng() < 0.5 ? Math.round((rng() * 7000 + 3000) / 100) * 100 : 0
    const teiCost = isAccepted && hbuCost === 0 ? Math.round((rng() * 7000 + 3000) / 100) * 100 : 0

    records.push({
      rowNumber: i + 2,
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
      hbuCost,
      teiCost,
      manualTotalCost: isAccepted ? medicalCost + airtimeCost + feedingCost + hbuCost + teiCost : null,
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
      rowNumber: i + 2,
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

function gradeStep(rng: () => number): { previous: string; next: string } {
  const i = Math.floor(rng() * (GRADES.length - 1))
  return { previous: GRADES[i], next: GRADES[i + 1] }
}

function generateInternalMobility(count: number, rng: () => number, _now: Date): InternalMobilityRecord[] {
  const records: InternalMobilityRecord[] = []
  for (let i = 0; i < count; i++) {
    const { previous, next } = gradeStep(rng)
    const lateral = rng() < 0.3
    records.push({
      rowNumber: i + 2,
      staffId: `SAMP-${1000 + i}`,
      name: `Sample Staff ${i + 1}`,
      currentBU: pick(rng, BUS),
      currentRole: pick(rng, ROLES).name,
      previousBU: pick(rng, BUS),
      previousRole: pick(rng, ROLES).name,
      deploymentMonth: pick(rng, MONTHS),
      previousGrade: previous,
      newGrade: lateral ? previous : next,
    })
  }
  return records
}

function generateConversions(count: number, rng: () => number, now: Date): ConversionRecord[] {
  const records: ConversionRecord[] = []
  for (let i = 0; i < count; i++) {
    const internStartDate = daysAgo(now, Math.floor(rng() * 400) + 180)
    const cost = Math.round((rng() * 50000 + 20000) / 1000) * 1000
    records.push({
      rowNumber: i + 2,
      staffId: `SAMP-C${2000 + i}`,
      name: `Sample Intern ${i + 1}`,
      bu: pick(rng, BUS),
      role: pick(rng, ROLES).name,
      internStartDate,
      grade: GRADES[0],
      conversionEffectiveDate: daysAgo(internStartDate, -(Math.floor(rng() * 150) + 150)),
      manager: `Manager ${Math.floor(rng() * 8) + 1}`,
      offerRate: 'Accepted',
      costPerConversion: cost,
    })
  }
  return records
}

function generateNotConverted(count: number, rng: () => number, now: Date): NotConvertedRecord[] {
  const records: NotConvertedRecord[] = []
  for (let i = 0; i < count; i++) {
    records.push({
      rowNumber: i + 2,
      staffId: `SAMP-N${3000 + i}`,
      name: `Sample Intern (Not Converted) ${i + 1}`,
      bu: pick(rng, BUS),
      role: pick(rng, ROLES).name,
      employmentStartDate: daysAgo(now, Math.floor(rng() * 400) + 180),
      grade: GRADES[0],
      manager: `Manager ${Math.floor(rng() * 8) + 1}`,
      reason: pick(rng, NOT_CONVERTED_REASONS),
    })
  }
  return records
}

function generateVacancies(count: number, rng: () => number, now: Date): VacancyRecord[] {
  const records: VacancyRecord[] = []
  for (let i = 0; i < count; i++) {
    const status = pick(rng, VACANCY_STATUSES)
    const dateOpened = daysAgo(now, Math.floor(rng() * 180) + 10)
    records.push({
      rowNumber: i + 2,
      role: pick(rng, ROLES).name,
      bu: pick(rng, BUS),
      numberOfVacancies: Math.floor(rng() * 3) + 1,
      location: pick(rng, ['Lagos', 'Abuja', 'Port Harcourt']),
      grade: pick(rng, GRADES),
      status,
      dateOpened,
      dateFilled: null, // sheet has no Date Filled column yet — see ta-types.ts's VacancyRecord comment
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
    internalMobility: generateInternalMobility(25, rng, now),
    conversions: generateConversions(15, rng, now),
    notConverted: generateNotConverted(8, rng, now),
    vacancies: generateVacancies(20, rng, now),
    offerStatusTracksWithdrawals: true,
  }
}
