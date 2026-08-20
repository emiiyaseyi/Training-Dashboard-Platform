'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SurveyAutomationPanel } from '@/components/admin/SurveyAutomationPanel'
import { SurveyQuestionEditor } from '@/components/admin/SurveyQuestionEditor'
import { SurveyResponseMirrorPanel } from '@/components/admin/SurveyResponseMirrorPanel'
import { TrainingDataMirrorPanel } from '@/components/admin/TrainingDataMirrorPanel'

export default function AdminSurveysPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Survey Automation"
        subtitle="Training schedules, survey questions, and pre/post-training survey emails"
        actions={
          <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin Settings
          </Link>
        }
      />
      <div className="p-8 space-y-6">
        <SurveyResponseMirrorPanel />
        <TrainingDataMirrorPanel />
        <SurveyAutomationPanel />
        <SurveyQuestionEditor />
      </div>
    </div>
  )
}
