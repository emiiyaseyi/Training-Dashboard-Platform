import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseRosterExcel } from '@/lib/excel-parser'

// Header row of the cleaned staff list (Meristem Staff List - October 2026), values as Google
// Sheets returns them through fetchSheetAsBuffer: every cell is the text as displayed.
const HEADERS = [
  'S/N', 'Staff ID', 'email', 'FIRST NAME', 'LAST NAME', 'MIDDLE NAME', 'Fullname', 'Line Manager ID', 'Line Manager Email', 'Line Manager Name',
  'DATE OF BIRTH', 'AGE', 'EMPLOYMENT DATE', 'LENGTH OF SERVICE', 'Business Unit', 'CONFIRMATION STATUS', 'PAY GROUP', 'TYPE OF EMPLOYMENT',
  'STAFF CATEGORY', 'DEPARTMENT', 'JOB ROLE', 'LOCATION', 'MARITAL STATUS', 'STATE OF ORIGIN', 'GEO POLITICAL ZONE', 'RELIGION', 'END DATE',
  'Duplicate Rows Merged', 'Employment Status', 'Personal Email Address', 'Phone Number', 'Sex',
]

function buffer(row: string[]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, row])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('parseRosterExcel — staff list columns', () => {
  const row = [
    '1', 'MRL-0014', 'akeemwahab@meristemng.com', 'Wahab', 'Akeem', '', 'Wahab Akeem', 'MSL-0013', 'gbengaadegbite@meristemng.com', 'Gbenga Adegbite',
    '27/10/1988', '37', '05/12/2023', '2 years', 'Meristem Securities Limited', 'Not Confirmed', 'MeriMovers', 'Full Time',
    'Back Office', 'Admin', 'Meri mover', 'Lagos', 'Married', 'Ogun', 'South West', 'Islam', '',
    '0', 'Exited', 'a@gmail.com', '+234-8100000003', 'Male',
  ]

  it('reads every column the import needs, with the right header', () => {
    const { rows, errors } = parseRosterExcel(buffer(row))
    expect(errors).toEqual([])
    const r = rows[0]
    expect(r.staffId).toBe('MRL-0014')
    expect(r.email).toBe('akeemwahab@meristemng.com') // not "Line Manager Email" / "Personal Email Address"
    expect(r.lineManagerStaffId).toBe('MSL-0013')
    expect(r.role).toBe('Meri mover')
    expect(r.department).toBe('Admin')
    expect(r.confirmed).toBe(false)
    expect(r.active).toBe(false)
    expect(r.staffCategory).toBe('Back Office')
    expect(r.employmentType).toBe('Full Time')
    expect(r.payGroup).toBe('MeriMovers')
    expect(r.location).toBe('Lagos')
    expect(r.stateOfOrigin).toBe('Ogun')
    expect(r.geoPoliticalZone).toBe('South West')
    expect(r.personalEmail).toBe('a@gmail.com')
    expect(r.phone).toBe('+234-8100000003')
  })

  it('turns "-" placeholders into empty values and repairs phone numbers a spreadsheet turned into a sum', () => {
    const r2 = [...row]
    r2[HEADERS.indexOf('MIDDLE NAME')] = '-'
    r2[HEADERS.indexOf('Phone Number')] = '-8033247762' // what "+234-08033247996" becomes when pasted into a cell
    const { rows } = parseRosterExcel(buffer(r2))
    expect(rows[0].middleName).toBe('')
    expect(rows[0].phone).toBe('08033247996')
  })

  it('restores the leading zero a spreadsheet drops from a phone number, and reads international form', () => {
    for (const [input, expected] of [['8033247996', '08033247996'], ['+2348033247996', '08033247996'], ['08033247996', '08033247996']]) {
      const r2 = [...row]
      r2[HEADERS.indexOf('Phone Number')] = input
      expect(parseRosterExcel(buffer(r2)).rows[0].phone).toBe(expected)
    }
  })

  it('reads day-first dates as written (27/10/1988 and 05/12/2023 are not month-first)', () => {
    const { rows } = parseRosterExcel(buffer(row))
    expect(rows[0].dateOfBirth?.slice(0, 10)).toBe('1988-10-27')
    expect(rows[0].employmentDate?.slice(0, 10)).toBe('2023-12-05')
    expect(rows[0].endDate).toBeNull()
  })
})
