'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SurveyAutomationPanel } from '@/components/admin/SurveyAutomationPanel'
import { SurveyQuestionEditor } from '@/components/admin/SurveyQuestionEditor'
import { SurveyResponseMirrorPanel } from '@/components/admin/SurveyResponseMirrorPanel'
import { TrainingDataMirrorPanel } from '@/components/admin/TrainingDataMirrorPanel'
import { SurveySendLogPanel } from '@/components/admin/SurveySendLogPanel'
import { SurveyInsightsPanel } from '@/components/admin/SurveyInsightsPanel'
import { AlreadyAttendedTrainingsPanel } from '@/components/admin/AlreadyAttendedTrainingsPanel'

export default function AdminSurveysPage() {
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0)

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
      <div className="p-4 sm:p-8 space-y-6">
        <SurveyInsightsPanel />
        <SurveyResponseMirrorPanel />
        <TrainingDataMirrorPanel />
        <AlreadyAttendedTrainingsPanel onScheduleCreated={() => setScheduleRefreshKey((k) => k + 1)} />
        <SurveyAutomationPanel key={scheduleRefreshKey} />
        <SurveyQuestionEditor />
        <SurveySendLogPanel />
      </div>
    </div>
  )
}
