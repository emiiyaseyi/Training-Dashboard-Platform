import * as XLSX from 'xlsx'

export interface TrainingRow {
  serialNo: string
  staffName: string
  staffId: string
  training: string
  businessUnit: string
  month: string
  cost: number
  hours: number   // Learning Hours (optional — 0 if not provided)
}

export interface KSSRow {
  staffId: string
  staffName: string
  businessUnit: string
  durationMinutes: number  // In-Meeting Duration (minutes)
  month: string
}

export interface FeedbackRow {
  businessUnit: string
  trainingTitle: string
  role: string
  applicationResponse: string
  impactAlignment: string
  confidenceRating: number
  vendorRating: number     // Vendor/facilitator rating (0–5)
  vendorName: string       // Vendor/facilitator name
  roleRelevance: number    // "How relevant is this training to your role?" (1–5)
  expectationsMet: number  // "To what extent were your expectations met?" (1–5)
  qualitativeResponse: string
  month: string
}

export interface SubscriptionRow {
  month: string
  staffId: string
  staffName: string
  businessUnit: string
  membershipOrg: string
  amount: number
}

export interface ParseResult<T> {
  rows: T[]
  errors: string[]
  warnings: string[]
}

function normalise(val: unknown): string {
  return String(val ?? '').trim()
}

function toFloat(val: unknown): number {
  const n = parseFloat(String(val ?? '0').replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const normCandidates = candidates.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''))

  // Pass 1 — exact match
  for (const nc of normCandidates) {
    const idx = lower.indexOf(nc)
    if (idx !== -1) return headers[idx]
  }
  // Pass 2 — header contains the candidate (e.g. "Based on Confidence Ratings" → 'confidence')
  for (const nc of normCandidates) {
    const idx = lower.findIndex((h) => h.includes(nc))
    if (idx !== -1) return headers[idx]
  }
  // Pass 3 — candidate contains part of the header (short header inside a longer candidate)
  for (let i = 0; i < lower.length; i++) {
    if (lower[i].length < 3) continue
    if (normCandidates.some((nc) => nc.includes(lower[i]))) return headers[i]
  }
  return undefined
}

export function parseTrainingExcel(buffer: Buffer): ParseResult<TrainingRow> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const rows: TrainingRow[] = []
  const errors: string[] = []
  const warnings: string[] = []

  if (raw.length === 0) {
    errors.push('File contains no data rows.')
    return { rows, errors, warnings }
  }

  const headers = Object.keys(raw[0])
  const col = {
    sn:       findHeader(headers, ['sn', 'serialno', 'serial', 's/n']),
    name:     findHeader(headers, ['name', 'staffname', 'employeename', 'fullname']),
    staffId:  findHeader(headers, ['staffid', 'staffno', 'employeeid', 'employeeno', 'id', 'email', 'staffemail']),
    training: findHeader(headers, ['training', 'trainingname', 'trainingtitle', 'course', 'programme']),
    bu:       findHeader(headers, ['businessunit', 'businessunits', 'department', 'unit', 'bu']),
    month:    findHeader(headers, ['month', 'period', 'trainingmonth']),
    cost:     findHeader(headers, ['cost', 'amount', 'fee', 'trainingcost', 'spend']),
    hours:    findHeader(headers, ['learninghours', 'hoursoflearning', 'learningduration', 'traininghours', 'durationhours']),
  }

  if (!col.name) errors.push('Could not find a "Name" column.')
  if (!col.bu)   errors.push('Could not find a "Business Unit" column.')
  if (!col.cost) errors.push('Could not find a "Cost" column.')
  if (errors.length) return { rows, errors, warnings }

  raw.forEach((r, i) => {
    const lineNo = i + 2
    const name = normalise(r[col.name!])
    if (!name) { warnings.push(`Row ${lineNo}: Name is empty — skipped.`); return }

    const cost = toFloat(r[col.cost!])
    if (cost < 0) warnings.push(`Row ${lineNo}: Negative cost (${cost}) for "${name}".`)

    const staffId = normalise(r[col.staffId ?? ''] ?? '')
    if (!staffId) warnings.push(`Row ${lineNo}: No Staff ID for "${name}" — using row index as fallback.`)

    const hours = col.hours ? toFloat(r[col.hours] ?? 0) : 0
    if (col.hours && hours < 0) warnings.push(`Row ${lineNo}: Negative hours (${hours}) for "${name}".`)

    rows.push({
      serialNo:     normalise(r[col.sn ?? ''] ?? ''),
      staffName:    name,
      staffId:      staffId || `UNKNOWN_${i + 1}`,
      training:     normalise(r[col.training ?? ''] ?? ''),
      businessUnit: normalise(r[col.bu!]),
      month:        normalise(r[col.month ?? ''] ?? ''),
      cost,
      hours:        Math.max(0, hours),
    })
  })

  return { rows, errors, warnings }
}

export function parseFeedbackExcel(buffer: Buffer): ParseResult<FeedbackRow> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const rows: FeedbackRow[] = []
  const errors: string[] = []
  const warnings: string[] = []

  if (raw.length === 0) {
    errors.push('File contains no data rows.')
    return { rows, errors, warnings }
  }

  const headers = Object.keys(raw[0])
  const col = {
    bu:         findHeader(headers, ['businessunit', 'businessunits', 'department', 'unit', 'bu']),
    title:      findHeader(headers, ['trainingtitle', 'training', 'course', 'programme']),
    role:       findHeader(headers, ['role', 'jobtitle', 'position']),
    app:        findHeader(headers, ['applicationresponse', 'application', 'applied']),
    impact:     findHeader(headers, ['impactalignment', 'impact', 'alignment', 'strategicalignment']),
    confidence:    findHeader(headers, ['confidencerating', 'confidencelevel', 'basedonconfidence', 'confidence', 'ratingscale', 'rating', 'score', 'level']),
    roleRelevance: findHeader(headers, ['rolerelevance', 'relevance', 'trainingrelevance', 'relevanttorole', 'howrelevant', 'rolesuitability']),
    expectsMet:    findHeader(headers, ['expectationsmet', 'expectationmet', 'metexpectations', 'expectations', 'extentmet', 'towhichextent', 'extent']),
    vendorRating:  findHeader(headers, ['vendorrating', 'facilitatorrating', 'providerrating', 'trainerrating', 'facilitatorevaluation', 'vendorevaluation', 'providerrating', 'instructorrating']),
    vendorName:    findHeader(headers, ['vendorname', 'facilitatorname', 'providername', 'trainername', 'facilitator', 'vendor', 'trainer', 'provider']),
    qualitative:   findHeader(headers, ['qualitativeresponse', 'qualitative', 'comments', 'feedback', 'response']),
    month:         findHeader(headers, ['month', 'trainingmonth', 'period', 'feedbackmonth']),
  }

  if (!col.bu)    errors.push('Could not find a "Business Unit" column.')
  if (!col.title) errors.push('Could not find a "Training Title" column.')
  if (errors.length) return { rows, errors, warnings }

  raw.forEach((r, i) => {
    const lineNo = i + 2
    const bu = normalise(r[col.bu!])
    if (!bu) { warnings.push(`Row ${lineNo}: Business Unit empty — skipped.`); return }

    const confidence    = toFloat(r[col.confidence    ?? ''] ?? 0)
    const roleRel       = toFloat(r[col.roleRelevance ?? ''] ?? 0)
    const expMet        = toFloat(r[col.expectsMet    ?? ''] ?? 0)
    const vendorRat     = toFloat(r[col.vendorRating  ?? ''] ?? 0)
    if (confidence > 5)  warnings.push(`Row ${lineNo}: Confidence rating ${confidence} > 5.`)
    if (roleRel > 5)     warnings.push(`Row ${lineNo}: Role relevance ${roleRel} > 5.`)
    if (expMet > 5)      warnings.push(`Row ${lineNo}: Expectations met ${expMet} > 5.`)
    if (vendorRat > 5)   warnings.push(`Row ${lineNo}: Vendor rating ${vendorRat} > 5.`)

    rows.push({
      businessUnit:       bu,
      trainingTitle:      normalise(r[col.title!]),
      role:               normalise(r[col.role ?? ''] ?? ''),
      applicationResponse:normalise(r[col.app ?? ''] ?? ''),
      impactAlignment:    normalise(r[col.impact ?? ''] ?? ''),
      confidenceRating:   Math.min(5, Math.max(0, confidence)),
      roleRelevance:      Math.min(5, Math.max(0, roleRel)),
      expectationsMet:    Math.min(5, Math.max(0, expMet)),
      vendorRating:       Math.min(5, Math.max(0, vendorRat)),
      vendorName:         normalise(r[col.vendorName ?? ''] ?? ''),
      qualitativeResponse:normalise(r[col.qualitative ?? ''] ?? ''),
      month:              normalise(r[col.month ?? ''] ?? ''),
    })
  })

  return { rows, errors, warnings }
}

export function parseSubscriptionExcel(buffer: Buffer): ParseResult<SubscriptionRow> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const rows: SubscriptionRow[] = []
  const errors: string[] = []
  const warnings: string[] = []

  if (raw.length === 0) {
    errors.push('File contains no data rows.')
    return { rows, errors, warnings }
  }

  const headers = Object.keys(raw[0])
  const col = {
    month:   findHeader(headers, ['month', 'subscriptionmonth', 'period', 'starttime', 'start', 'startdate', 'date']),
    staffId: findHeader(headers, ['staffid', 'staffno', 'employeeid', 'employeeno', 'id', 'email', 'emailaddress']),
    name:    findHeader(headers, ['name', 'staffname', 'fullname']),
    bu:      findHeader(headers, ['businessunit', 'businessunits', 'department', 'unit', 'bu']),
    org:     findHeader(headers, ['membershiporganization', 'membershiporganisation', 'organization', 'organisation', 'membership', 'body', 'professionalbody']),
    amount:  findHeader(headers, ['amount', 'cost', 'fee', 'subscriptioncost', 'subscriptionfee']),
  }

  if (!col.name)   errors.push('Could not find a "Name" column.')
  if (!col.bu)     errors.push('Could not find a "Business Unit" column.')
  if (!col.org)    errors.push('Could not find a "Membership Organization" column.')
  if (!col.amount) errors.push('Could not find an "Amount" column.')
  if (errors.length) return { rows, errors, warnings }

  raw.forEach((r, i) => {
    const lineNo = i + 2
    const name = normalise(r[col.name!])
    if (!name) { warnings.push(`Row ${lineNo}: Name is empty — skipped.`); return }

    const amount = toFloat(r[col.amount!])
    if (amount <= 0) warnings.push(`Row ${lineNo}: Amount is 0 or missing for "${name}".`)

    const staffId = normalise(r[col.staffId ?? ''] ?? '')
    if (!staffId) warnings.push(`Row ${lineNo}: No Staff ID for "${name}" — using row index as fallback.`)

    rows.push({
      month:        normalise(r[col.month ?? ''] ?? ''),
      staffId:      staffId || `UNKNOWN_${i + 1}`,
      staffName:    name,
      businessUnit: normalise(r[col.bu!]),
      membershipOrg:normalise(r[col.org!]),
      amount,
    })
  })

  return { rows, errors, warnings }
}

// ── KSS (Knowledge Sharing Session) ──────────────────────────────────────────

export function parseKSSExcel(buffer: Buffer): ParseResult<KSSRow> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const rows: KSSRow[] = []
  const errors: string[] = []
  const warnings: string[] = []

  if (raw.length === 0) {
    errors.push('File contains no data rows.')
    return { rows, errors, warnings }
  }

  const headers = Object.keys(raw[0])
  const col = {
    staffId:  findHeader(headers, ['staffid', 'staffno', 'employeeid', 'id']),
    name:     findHeader(headers, ['name', 'staffname', 'fullname', 'employeename']),
    bu:       findHeader(headers, ['businessunit', 'businessunits', 'department', 'unit', 'bu']),
    duration: findHeader(headers, ['inmeetingduration', 'duration', 'meetingduration', 'durationminutes', 'minutes', 'timespent']),
    month:    findHeader(headers, ['month', 'period', 'sessionmonth']),
  }

  if (!col.name)     errors.push('Could not find a "Name" column.')
  if (!col.bu)       errors.push('Could not find a "Business Unit" column.')
  if (!col.duration) errors.push('Could not find an "In-Meeting Duration" column.')
  if (errors.length) return { rows, errors, warnings }

  raw.forEach((r, i) => {
    const lineNo = i + 2
    const name = normalise(r[col.name!])
    if (!name) { warnings.push(`Row ${lineNo}: Name is empty — skipped.`); return }

    const staffId = normalise(r[col.staffId ?? ''] ?? '')
    if (!staffId) warnings.push(`Row ${lineNo}: No Staff ID for "${name}" — using row index.`)

    const rawDur = normalise(r[col.duration!])
    let durationMinutes = 0
    if (rawDur.includes(':')) {
      const parts = rawDur.split(':').map(Number)
      if (parts.length === 3) durationMinutes = parts[0] * 60 + parts[1] + parts[2] / 60
      else if (parts.length === 2) durationMinutes = parts[0] + parts[1] / 60
    } else {
      durationMinutes = toFloat(rawDur)
    }

    if (durationMinutes <= 0) warnings.push(`Row ${lineNo}: Zero/invalid duration for "${name}".`)

    rows.push({
      staffId:         staffId || `UNKNOWN_${i + 1}`,
      staffName:       name,
      businessUnit:    normalise(r[col.bu!]),
      durationMinutes: Math.max(0, durationMinutes),
      month:           normalise(r[col.month ?? ''] ?? ''),
    })
  })

  return { rows, errors, warnings }
}
