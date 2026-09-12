// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/sheetColumns.ts), unchanged. Shared column-name mapping so the sheet's header spelling
// (typos, casing, abbreviations included) can vary without breaking the parser.

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function headerIndex(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((h, i) => map.set(normalizeHeader(String(h ?? '')), i))
  return map
}

export type SheetField =
  | 'id'
  | 'candidateName'
  | 'role'
  | 'bu'
  | 'requisitionStartDate'
  | 'offerStatus'
  | 'offerExtendedDate'
  | 'resumptionDate'
  | 'manualTimeToHireWeeks'
  | 'medicalCost'
  | 'airtime'
  | 'feeding'
  | 'manualTotalCost'
  | 'officeType'
  | 'hiringSource'
  | 'currentStage'

export const HEADER_ALIASES: Record<SheetField, string[]> = {
  id: ['id'],
  candidateName: ['candidate name', 'name'],
  role: ['role'],
  bu: ['bu'],
  requisitionStartDate: ['requisition start date', 'requsition start date'],
  offerStatus: ['offer status'],
  offerExtendedDate: ['offer extended date'],
  resumptionDate: ['resumption date'],
  manualTimeToHireWeeks: ['time to hire (week)', 'time to hire(week)', 'time to hire (weeks)', 'time to hire(weeks)'],
  medicalCost: ['pre-employment medical test', 'pre-employment medical test cost', 'medical cost'],
  airtime: ['airtime'],
  feeding: ['feeding'],
  manualTotalCost: ['total cost'],
  officeType: ['office type'],
  hiringSource: ['hiring source', 'source'],
  currentStage: ['current stage', 'pipeline stage', 'stage'],
}

export function findColumn(idx: Map<string, number>, field: SheetField): number | undefined {
  for (const alias of HEADER_ALIASES[field]) {
    const i = idx.get(alias)
    if (i != null) return i
  }
  return undefined
}
