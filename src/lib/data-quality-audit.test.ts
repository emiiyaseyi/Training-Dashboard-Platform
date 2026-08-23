import { describe, it, expect } from 'vitest'
import { isBlankStaffId, hasMatchingIssue } from './data-quality-audit'

describe('isBlankStaffId', () => {
  it('treats an empty string as blank', () => {
    expect(isBlankStaffId('')).toBe(true)
  })
  it('treats the upload-time placeholder as blank', () => {
    expect(isBlankStaffId('UNKNOWN_1')).toBe(true)
    expect(isBlankStaffId('UNKNOWN_42')).toBe(true)
  })
  it('treats a real Staff ID as not blank', () => {
    expect(isBlankStaffId('MSL-0029')).toBe(false)
  })
})

// This is the rule Data Quality Audit's "apply to N other records" propagation uses to decide
// which other records share the exact same issue as the one just fixed — shared by every table's
// fix function in src/app/api/admin/data-quality/[table]/[id]/route.ts.
describe('hasMatchingIssue', () => {
  it('matches a candidate whose Staff ID is still blank, when Staff ID was one of the fixed fields', () => {
    expect(hasMatchingIssue({ staffId: 'UNKNOWN_3', businessUnit: 'MSL' }, ['staffId'])).toBe(true)
  })

  it('does not match a candidate that already has a real Staff ID', () => {
    expect(hasMatchingIssue({ staffId: 'MWML-0010', businessUnit: 'MSL' }, ['staffId'])).toBe(false)
  })

  it('matches a candidate with a blank Business Unit, for non-staffId fields', () => {
    expect(hasMatchingIssue({ businessUnit: '' }, ['businessUnit'])).toBe(true)
    expect(hasMatchingIssue({ businessUnit: 'Meristem Securities Limited' }, ['businessUnit'])).toBe(false)
  })

  it('matches if ANY of several fixed fields still shows the issue (not requiring all)', () => {
    const candidate = { staffId: 'MSL-0029', businessUnit: '', training: 'Something' }
    expect(hasMatchingIssue(candidate, ['staffId', 'businessUnit'])).toBe(true)
  })

  it('does not match once every fixed field already has a value', () => {
    const candidate = { staffId: 'MSL-0029', businessUnit: 'Meristem Securities Limited' }
    expect(hasMatchingIssue(candidate, ['staffId', 'businessUnit'])).toBe(false)
  })
})
