// Talent Acquisition Admin — one config per row-based sheet tab, driving both the generic admin
// API route (/api/hr/admin/ta/[section]) and the generic admin UI (TaAdminSection). Adding a new
// editable field to a section is just adding one entry here — no new route or component needed.
//
// Config!BUs/Roles/etc. (the Config tab) is deliberately NOT included — it's column-based lookup
// lists, not row records, and needs a different editor shape than every other TA tab.

import type { SheetField } from './ta-sheet-columns'
import { HIRES_RANGE, PIPELINE_RANGE, INTERNAL_MOBILITY_RANGE, CONVERSION_RANGE, NOT_CONVERTED_RANGE, VACANCIES_RANGE } from './ta-sheets'

export type TaFieldType = 'text' | 'number' | 'date' | 'select' | 'textarea'

export interface TaAdminField {
  key: SheetField
  label: string
  type: TaFieldType
  options?: string[] // for type: 'select'
  required?: boolean
}

export interface TaAdminSection {
  slug: string
  sheetName: string
  range: string
  label: string
  fields: TaAdminField[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const TA_ADMIN_SECTIONS: Record<string, TaAdminSection> = {
  hires: {
    slug: 'hires',
    sheetName: 'Hires',
    range: HIRES_RANGE,
    label: 'Hires',
    fields: [
      { key: 'candidateName', label: 'Name', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'bu', label: 'BU', type: 'text' },
      { key: 'requisitionStartDate', label: 'Requisition start date', type: 'date', required: true },
      { key: 'resumptionDate', label: 'Resumption date', type: 'date' },
      { key: 'offerAccepted', label: 'Offer Acceptance', type: 'select', options: ['Yes', 'No'] },
      { key: 'manualTimeToHireWeeks', label: 'Time to hire (weeks)', type: 'number' },
      { key: 'medicalCost', label: 'Pre-employment Medical test', type: 'number' },
      { key: 'airtime', label: 'Airtime', type: 'number' },
      { key: 'feeding', label: 'Feeding', type: 'number' },
      { key: 'hbuCost', label: 'HBU Cost', type: 'number' },
      { key: 'teiCost', label: 'TEI Cost', type: 'number' },
      { key: 'manualTotalCost', label: 'Total cost', type: 'number' },
      { key: 'officeType', label: 'Office Type', type: 'text' },
      { key: 'hiringSource', label: 'Hiring Source', type: 'text' },
    ],
  },
  pipeline: {
    slug: 'pipeline',
    sheetName: 'Pipeline',
    range: PIPELINE_RANGE,
    label: 'Pipeline',
    fields: [
      { key: 'candidateName', label: 'Name', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'bu', label: 'BU', type: 'text' },
      { key: 'officeType', label: 'Office Type', type: 'text' },
      { key: 'hiringSource', label: 'Hiring Source', type: 'text' },
      { key: 'requisitionStartDate', label: 'Requisition start date', type: 'date', required: true },
      { key: 'currentStage', label: 'Current Stage', type: 'text' },
    ],
  },
  'internal-mobility': {
    slug: 'internal-mobility',
    sheetName: 'Internal Mobility',
    range: INTERNAL_MOBILITY_RANGE,
    label: 'Internal Mobility',
    fields: [
      { key: 'staffId', label: 'Staff ID', type: 'text' },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'currentBU', label: 'Current BU', type: 'text' },
      { key: 'currentRole', label: 'Current Role', type: 'text' },
      { key: 'previousBU', label: 'Previous BU', type: 'text' },
      { key: 'previousRole', label: 'Previous Role', type: 'text' },
      { key: 'deploymentMonth', label: 'Deployment Month', type: 'select', options: MONTHS },
      { key: 'previousGrade', label: 'Previous Grade', type: 'text' },
      { key: 'newGrade', label: 'New Grade', type: 'text' },
    ],
  },
  conversion: {
    slug: 'conversion',
    sheetName: 'Conversion',
    range: CONVERSION_RANGE,
    label: 'Conversion',
    fields: [
      { key: 'staffId', label: 'Staff ID', type: 'text' },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'bu', label: 'BU', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      // Free text, not a date input — the real sheet only ever has a bare year here (e.g. "2025").
      { key: 'internStartDate', label: 'Intern Start Date', type: 'text' },
      { key: 'grade', label: 'Grade', type: 'text' },
      { key: 'conversionEffectiveDate', label: 'Conversion Effective Date', type: 'date', required: true },
      { key: 'manager', label: 'Manager', type: 'text' },
      { key: 'offerRate', label: 'Offer Rate', type: 'text' },
      { key: 'costPerConversion', label: 'Cost per Conversion', type: 'number' },
    ],
  },
  'not-converted': {
    slug: 'not-converted',
    sheetName: 'Not Converted',
    range: NOT_CONVERTED_RANGE,
    label: 'Not Converted',
    fields: [
      { key: 'staffId', label: 'Staff ID', type: 'text' },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'bu', label: 'BU', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'employmentStartDate', label: 'Employment Start Date', type: 'text' },
      { key: 'grade', label: 'Grade', type: 'text' },
      { key: 'manager', label: 'Manager', type: 'text' },
      { key: 'reason', label: 'Reason', type: 'textarea' },
    ],
  },
  vacancies: {
    slug: 'vacancies',
    sheetName: 'Vacancies',
    range: VACANCIES_RANGE,
    label: 'Vacancies',
    fields: [
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'bu', label: 'BU', type: 'text' },
      { key: 'numberOfVacancies', label: 'No of Vacancies', type: 'number' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'grade', label: 'Grade', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'dateOpened', label: 'Date Opened', type: 'date' },
    ],
  },
}
