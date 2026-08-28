import { describe, it, expect } from 'vitest'
import {
  hasAccess,
  pageKeyForPath,
  normalizeStaffId,
  normalizeEmail,
  parseBUScope,
  serializeBUScope,
} from './permissions'

describe('hasAccess', () => {
  it('ranks admin > view-export > view', () => {
    expect(hasAccess('admin', 'view')).toBe(true)
    expect(hasAccess('admin', 'view-export')).toBe(true)
    expect(hasAccess('admin', 'admin')).toBe(true)
    expect(hasAccess('view-export', 'admin')).toBe(false)
    expect(hasAccess('view', 'view-export')).toBe(false)
  })

  it('denies access for missing, null, or unrecognized levels', () => {
    expect(hasAccess(undefined, 'view')).toBe(false)
    expect(hasAccess(null, 'view')).toBe(false)
    expect(hasAccess('', 'view')).toBe(false)
    expect(hasAccess('bogus-level', 'view')).toBe(false)
  })

  it('grants access at exactly the required level', () => {
    expect(hasAccess('view', 'view')).toBe(true)
    expect(hasAccess('view-export', 'view-export')).toBe(true)
  })
})

describe('pageKeyForPath', () => {
  it('maps the root path to executive-overview', () => {
    expect(pageKeyForPath('/')).toBe('executive-overview')
  })

  it('maps a top-level route to its page key', () => {
    expect(pageKeyForPath('/training')).toBe('training-analytics')
    expect(pageKeyForPath('/admin')).toBe('admin-settings')
  })

  it('resolves nested routes via longest-prefix match', () => {
    expect(pageKeyForPath('/admin/users/123')).toBe('admin-settings')
    expect(pageKeyForPath('/training/2026/august')).toBe('training-analytics')
  })

  it('returns null for a path with no matching page', () => {
    expect(pageKeyForPath('/does-not-exist')).toBeNull()
  })

  // Documents current behavior, not necessarily desired behavior: pageKeyForPath does a plain
  // `pathname.startsWith(route)` with no path-separator boundary check, so a route name that's a
  // literal string-prefix of an unrelated path (e.g. '/trainingx' vs '/training') is a false
  // positive match. Flagging this here as a known quirk rather than silently asserting it away.
  it('(quirk) a path that string-prefixes a route name without a "/" boundary still matches it', () => {
    expect(pageKeyForPath('/trainingx')).toBe('training-analytics')
  })
})

describe('normalizeStaffId', () => {
  it('trims and uppercases', () => {
    expect(normalizeStaffId('  msl0234  ')).toBe('MSL0234')
  })

  it('returns null for empty/whitespace-only/undefined/null input', () => {
    expect(normalizeStaffId('')).toBeNull()
    expect(normalizeStaffId('   ')).toBeNull()
    expect(normalizeStaffId(undefined)).toBeNull()
    expect(normalizeStaffId(null)).toBeNull()
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM  ')).toBe('jane.doe@example.com')
  })

  it('returns null for empty/whitespace-only/undefined/null input', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })
})

describe('parseBUScope / serializeBUScope round-trip', () => {
  it('treats "ALL" and empty/null as unrestricted', () => {
    expect(parseBUScope('ALL')).toBe('ALL')
    expect(parseBUScope(null)).toBe('ALL')
    expect(parseBUScope(undefined)).toBe('ALL')
    expect(parseBUScope('')).toBe('ALL')
  })

  it('parses a JSON array of BU names', () => {
    expect(parseBUScope('["Finance","Operations"]')).toEqual(['Finance', 'Operations'])
  })

  it('treats a bare (pre-multi-select) BU name as a single-item list', () => {
    expect(parseBUScope('Finance')).toEqual(['Finance'])
  })

  it('treats an empty JSON array as unrestricted', () => {
    expect(parseBUScope('[]')).toBe('ALL')
  })

  it('serializes ALL and an empty array back to the literal "ALL"', () => {
    expect(serializeBUScope('ALL')).toBe('ALL')
    expect(serializeBUScope([])).toBe('ALL')
  })

  it('serializes a scope list to JSON and parses it back to the same list', () => {
    const scope = ['Finance', 'Operations']
    const serialized = serializeBUScope(scope)
    expect(parseBUScope(serialized)).toEqual(scope)
  })
})
