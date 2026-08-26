import { prisma } from '@/lib/prisma'

export type AuditAction = 'login_success' | 'login_failure' | 'page_view' | 'admin_action'

// Never throws — an audit log write failing must never break the actual login/request it's
// describing. Logged to the console instead so a systemic failure (e.g. a schema drift) is still
// visible somewhere, just not to the end user.
export async function logAudit(entry: {
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  action: AuditAction
  detail?: string | null
}): Promise<void> {
  try {
    await prisma.auditLogEntry.create({
      data: {
        userId: entry.userId ?? null,
        userName: entry.userName ?? null,
        userEmail: entry.userEmail ?? null,
        action: entry.action,
        detail: entry.detail ?? null,
      },
    })
  } catch (err) {
    console.error('[audit-log] failed to write entry', err)
  }
}
