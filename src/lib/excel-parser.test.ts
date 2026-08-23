import { describe, it, expect } from 'vitest'
import { findHeader } from './excel-parser'

describe('findHeader', () => {
  // Regression test for the exact bug that broke "Push Vendors to Sheet": a broad candidate like
  // "trainingname" (meant to catch a header literally called "Training Name") can contain a much
  // shorter, unrelated header ("Name") as a substring. If substring matching ran before exact
  // matching, it would grab "Name" for the Training field before ever reaching the real,
  // exact-matching "Training" column further along the row.
  it('prefers an exact match anywhere in the header row over a substring match earlier in it', () => {
    const headers = ['S/N', 'Staff ID', 'Name', 'Training', 'Business Units', 'Month', 'Cost', 'Vendor']

    expect(findHeader(headers, ['training', 'trainingname', 'trainingtitle', 'course', 'programme'])).toBe('Training')
    expect(findHeader(headers, ['month', 'period', 'trainingmonth'])).toBe('Month')
    expect(findHeader(headers, ['vendor', 'trainingvendor', 'provider', 'facilitator', 'trainer'])).toBe('Vendor')
    expect(findHeader(headers, ['name', 'staffname', 'employeename', 'fullname'])).toBe('Name')
  })

  it('falls back to a substring match when no exact match exists', () => {
    const headers = ['Employee Full Name', 'Business Unit', 'Training Programme Title']
    expect(findHeader(headers, ['name', 'staffname', 'fullname'])).toBe('Employee Full Name')
    expect(findHeader(headers, ['training', 'trainingtitle', 'programme'])).toBe('Training Programme Title')
  })

  it('only matches a short candidate (under 4 chars) exactly, never by substring', () => {
    // A short candidate like "id" must not match by coincidentally appearing inside an unrelated
    // header ("mIDdle Name") — but a header that IS exactly "ID" still matches.
    expect(findHeader(['Middle Name'], ['id'])).toBeUndefined()
    expect(findHeader(['Middle Name', 'ID'], ['id'])).toBe('ID')
  })

  it('returns undefined when nothing matches at all', () => {
    const headers = ['Foo', 'Bar']
    expect(findHeader(headers, ['training', 'vendor'])).toBeUndefined()
  })
})
