// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/types.ts), unchanged: this is a pure data-shape file with no framework dependency.

export type OfferStatus = 'Accepted' | 'Declined' | 'Pending' | 'Withdrawn'

/** "Front Office" / "Back Office" — the org's own category. Free string (not a union) because
 * it's validated against Config!OfficeTypes, same as BU/Role. */
export type OfficeType = string

/** One row from the `Hires` sheet tab, parsed into typed form. */
export interface HireRecord {
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
  manualTotalCost: number | null
}

/** One row from the `Pipeline` sheet tab — candidates still in progress. */
export interface PipelineRecord {
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

export interface DashboardData {
  records: HireRecord[]
  pipeline: PipelineRecord[]
  config: ConfigLists
}

export interface Filters {
  from: Date | null
  to: Date | null
  bu: string | null
  role: string | null
  officeType: string | null
}
