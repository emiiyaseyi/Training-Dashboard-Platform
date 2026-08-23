import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { batchUpdateRowsByCompoundKey } from './google-sheets'

// Regression coverage for the "Push Vendors to Sheet" bug: batchUpdateRowsByCompoundKey used to
// scan headers in sheet order and stop at the first substring match, which meant "Name" (sitting
// before "Training") got matched as the Training key part, and "Training" (sitting before
// "Month") got matched as the Month key part — both false positives found before the scan ever
// reached the real, exact-matching columns. Fixed by delegating to findHeader()'s exact-first
// matching. These tests lock that fix in against the actual header layout that broke.

const SHEET_ROWS = [
  ['S/N', 'Staff ID', 'Name', 'Training', 'Business Units', 'Month', 'Cost', 'Learning Hours', 'Vendor'],
  ['1', 'MSL-0029', 'Adedapo Odejimi', 'Achieving Leadership Excellence', 'Meristem Securities Limited', 'March', '100000', '75', ''],
  ['2', 'MWML-0010', 'Morayo Jaiyeola', 'Achieving Leadership Excellence', 'Meristem Wealth Management Limited', 'March', '100000', '75', ''],
]

function mockFetch() {
  const calls: { url: string; body?: unknown }[] = []
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.includes(':batchUpdate')) {
      return { ok: true, json: async () => ({}) } as Response
    }
    return { ok: true, json: async () => ({ values: SHEET_ROWS }) } as Response
  })
  vi.stubGlobal('fetch', impl)
  return { calls, impl }
}

describe('batchUpdateRowsByCompoundKey', () => {
  beforeEach(() => mockFetch())
  afterEach(() => vi.unstubAllGlobals())

  it('matches rows by Staff ID + Training + Month and writes the Vendor column, not Training', async () => {
    const { calls } = mockFetch()

    const result = await batchUpdateRowsByCompoundKey(
      'sheet-id',
      'Training Cost',
      'token',
      [
        ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'],
        ['training', 'trainingname', 'trainingtitle', 'course', 'programme'],
        ['month', 'period', 'trainingmonth'],
      ],
      [
        {
          keyParts: ['MSL-0029', 'Achieving Leadership Excellence', 'March'],
          updates: [{ columnCandidates: ['vendor', 'trainingvendor', 'provider', 'facilitator', 'trainer'], value: 'NGX' }],
        },
      ]
    )

    expect(result.found).toBe(1)
    expect(result.notFound).toBe(0)
    expect(result.error).toBeUndefined()

    const updateCall = calls.find((c) => c.url.includes(':batchUpdate'))
    expect(updateCall).toBeDefined()
    const data = (updateCall!.body as { data: { range: string; values: string[][] }[] }).data
    expect(data).toHaveLength(1)
    // Row 2 (header is row 1) — column I is "Vendor" (0-indexed col 8), NOT column D ("Training").
    expect(data[0].range).toBe('Training Cost!I2')
    expect(data[0].values).toEqual([['NGX']])
  })

  it('reports which key column is missing instead of silently returning 0', async () => {
    mockFetch()
    const result = await batchUpdateRowsByCompoundKey(
      'sheet-id',
      'Training Cost',
      'token',
      [
        ['staffid'],
        ['training'],
        ['nonexistentcolumn'],
      ],
      [{ keyParts: ['MSL-0029', 'Achieving Leadership Excellence', 'March'], updates: [] }]
    )
    expect(result.found).toBe(0)
    expect(result.error).toContain('nonexistentcolumn')
  })
})
