// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/types.ts), unchanged: this is a pure data-shape file with no framework dependency.

export type OfferStatus = 'Accepted' | 'Declined' | 'Pending' | 'Withdrawn'

/** "Front Office" / "Back Office" — the org's own category. Free string (not a union) because
 * it's validated against Config!OfficeTypes, same as BU/Role. */
export type OfficeType = string

/** One row from the `Hires` sheet tab, parsed into typed form. */
export interface HireRecord {
  /** 1-indexed row number on the actual sheet (row 1 = header) — lets the TA Admin editor write
   * an update back to the exact cell it came from. Not shown on any analytics page. */
  rowNumber: number
  id: string
  candidateName: string
  role: string
  bu: string
  officeType: OfficeType
  hiringSource: string
  requisitionStartDate: Date
  offerStatus: OfferStatus
  offerExtendedDate: Date | null
  resumptionDate: Date | null
  manualTimeToHireWeeks: number | null
  medicalCost: number
  airtimeCost: number
  feedingCost: number
  /** Two more real cost categories on the sheet, one or the other populated per row — see
   * ta-sheet-columns.ts's comment. Included in computedTotalCost() alongside the other three. */
  hbuCost: number
  teiCost: number
  manualTotalCost: number | null
}

/** One row from the `Pipeline` sheet tab — candidates still in progress. */
export interface PipelineRecord {
  rowNumber: number
  id: string
  candidateName: string
  role: string
  bu: string
  officeType: OfficeType
  hiringSource: string
  requisitionStartDate: Date
  currentStage: string
}

/** Lookup lists from the `Config` tab — drives every dropdown/filter, never hardcoded. */
export interface ConfigLists {
  bus: string[]
  roles: string[]
  offerStatuses: OfferStatus[]
  officeTypes: string[]
  hiringSources: string[]
  pipelineStages: string[]
}

/** One row from the `Internal Mobility` sheet tab — a staff member's move between BU/role.
 * deploymentMonth is month-only by design (e.g. "January") — the sheet doesn't track a day or
 * year for this, so it's kept as free text rather than forced into a Date. */
export interface InternalMobilityRecord {
  rowNumber: number
  staffId: string
  name: string
  currentBU: string
  currentRole: string
  previousBU: string
  previousRole: string
  deploymentMonth: string
  previousGrade: string
  newGrade: string
}

/** One row from the `Conversion` sheet tab — an intern who converted to full-time. */
export interface ConversionRecord {
  rowNumber: number
  staffId: string
  name: string
  bu: string
  role: string
  internStartDate: Date | null
  grade: string
  conversionEffectiveDate: Date
  manager: string
  // Raw passthrough — this sheet only ever lists people who DID convert, so the exact intent of
  // a per-row "Offer Rate" value isn't fully clear (every row here is already an accepted offer).
  // Captured as-is rather than guessed at; see computeOfferAcceptanceRate's own comment for how
  // it's actually used.
  offerRate: string | null
  costPerConversion: number | null
}

/** One row from the `Not Converted` sheet tab — an intern who did NOT convert, with a reason. */
export interface NotConvertedRecord {
  rowNumber: number
  staffId: string
  name: string
  bu: string
  role: string
  employmentStartDate: Date | null
  grade: string
  manager: string
  reason: string
}

/** One row from the `Vacancies` sheet tab. dateFilled is optional — the sheet as currently
 * configured doesn't have that column, so Time to Fill can't be computed until it's added; this
 * stays ready for the moment it is. */
export interface VacancyRecord {
  rowNumber: number
  role: string
  bu: string
  numberOfVacancies: number
  location: string
  grade: string
  status: string // e.g. "Open" | "Filled Internally" | "Filled Externally"
  dateOpened: Date | null
  dateFilled: Date | null
}

export interface DashboardData {
  records: HireRecord[]
  pipeline: PipelineRecord[]
  config: ConfigLists
  internalMobility: InternalMobilityRecord[]
  conversions: ConversionRecord[]
  notConverted: NotConvertedRecord[]
  vacancies: VacancyRecord[]
  /** False when the Hires sheet has no "Offer Status" column and offer outcomes are inferred from
   * a Yes/No "Offer Acceptance" column instead (see ta-sheets.ts's offerAcceptedToStatus) — that
   * scheme has no way to express "Withdrawn" at all, so Withdrawal Rate is genuinely unmeasurable
   * (not "measured at 0%") until the sheet gains a real Offer Status column or a third option. */
  offerStatusTracksWithdrawals: boolean
}

export interface Filters {
  from: Date | null
  to: Date | null
  bu: string | null
  role: string | null
  officeType: string | null
}
