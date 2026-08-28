import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// vi.mock factories are hoisted above regular `const` declarations, so any mock referenced inside
// one must itself come from vi.hoisted() — plain module-scope consts aren't safely accessible yet
// at the point the factory runs. See https://vitest.dev/api/vi.html#vi-hoisted
const { authMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  logAuditMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/auth', () => ({ auth: () => authMock() }))
vi.mock('@/lib/audit-log', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

// vi.mock is hoisted above this import too, so requirePermission/requireSession/buScopeFilter
// below already resolve '@/auth' and '@/lib/audit-log' to the mocks registered above.
import { requirePermission, requireSession, buScopeFilter } from './session-guard'

function session(overrides: Partial<{
  id: string
  isSuperAdmin: boolean
  businessUnitScope: string
  permissions: Record<string, string>
}> = {}) {
  return {
    user: {
      id: 'u1',
      name: 'Test User',
      email: 'test@example.com',
      isSuperAdmin: false,
      businessUnitScope: 'ALL',
      permissions: {},
      ...overrides,
    },
  }
}

beforeEach(() => {
  authMock.mockReset()
  logAuditMock.mockClear()
})

describe('requirePermission', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null)
    const result = await requirePermission('admin-settings', 'admin')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
    expect(logAuditMock).not.toHaveBeenCalled()
  })

  it('grants a super admin access regardless of their permissions map, and logs admin-level checks', async () => {
    authMock.mockResolvedValue(session({ isSuperAdmin: true, permissions: {} }))
    const result = await requirePermission('admin-settings', 'admin')
    expect(result).not.toBeInstanceOf(NextResponse)
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_action', detail: 'admin-settings' }))
  })

  it('does not log a view-level check even for a super admin', async () => {
    authMock.mockResolvedValue(session({ isSuperAdmin: true }))
    await requirePermission('training-analytics', 'view')
    expect(logAuditMock).not.toHaveBeenCalled()
  })

  it('denies a non-admin user without the required permission level, and logs the denial', async () => {
    authMock.mockResolvedValue(session({ permissions: { 'upload-data': 'view' } }))
    const result = await requirePermission('upload-data', 'admin')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_action', detail: 'upload-data (denied)' }))
  })

  it('grants a non-admin user with sufficient permission on the page, and logs admin-level grants', async () => {
    authMock.mockResolvedValue(session({ permissions: { 'upload-data': 'admin' } }))
    const result = await requirePermission('upload-data', 'admin')
    expect(result).not.toBeInstanceOf(NextResponse)
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_action', detail: 'upload-data' }))
  })

  it('does not grant access to a page the user has no entry for', async () => {
    authMock.mockResolvedValue(session({ permissions: { 'upload-data': 'admin' } }))
    const result = await requirePermission('admin-settings', 'view')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })
})

describe('requireSession', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null)
    const result = await requireSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('returns the session when authenticated', async () => {
    const s = session()
    authMock.mockResolvedValue(s)
    const result = await requireSession()
    expect(result).toBe(s)
  })
})

describe('buScopeFilter', () => {
  it('returns null (unrestricted) for a super admin regardless of their businessUnitScope', () => {
    expect(buScopeFilter(session({ isSuperAdmin: true, businessUnitScope: 'Finance' }))).toBeNull()
  })

  it('returns null (unrestricted) for a non-admin scoped to ALL', () => {
    expect(buScopeFilter(session({ businessUnitScope: 'ALL' }))).toBeNull()
  })

  it('returns the parsed BU list for a non-admin scoped to specific business units', () => {
    expect(buScopeFilter(session({ businessUnitScope: '["Finance","Operations"]' }))).toEqual(['Finance', 'Operations'])
  })

  it('treats a legacy bare BU name as a single-item scope list', () => {
    expect(buScopeFilter(session({ businessUnitScope: 'Finance' }))).toEqual(['Finance'])
  })
})
