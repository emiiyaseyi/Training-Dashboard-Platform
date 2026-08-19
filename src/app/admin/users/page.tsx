'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { UserManagementPanel } from '@/components/admin/UserManagementPanel'

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="User Access"
        subtitle="Manage who can sign in, which pages they see, and their permission level per page"
        actions={
          <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin Settings
          </Link>
        }
      />
      <div className="p-8">
        <UserManagementPanel />
      </div>
    </div>
  )
}
