'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SurveyAutomationPanel } from '@/components/admin/SurveyAutomationPanel'
import { SurveyQuestionEditor } from '@/components/admin/SurveyQuestionEditor'
import { CustomSurveyPanel } from '@/components/admin/CustomSurveyPanel'
import { SurveyResponseMirrorPanel } from '@/components/admin/SurveyResponseMirrorPanel'
import { TrainingDataMirrorPanel } from '@/components/admin/TrainingDataMirrorPanel'
import { SurveySendLogPanel } from '@/components/admin/SurveySendLogPanel'
import { SurveyInsightsPanel } from '@/components/admin/SurveyInsightsPanel'
import { AlreadyAttendedTrainingsPanel } from '@/components/admin/AlreadyAttendedTrainingsPanel'
import { UploadedFilesPanel } from '@/components/admin/UploadedFilesPanel'

export default function AdminSurveysPage() {
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0)
  // Read directly off window.location rather than next/navigation's useSearchParams, which
  // requires a Suspense boundary around any page that uses it — this page is fully client-
  // rendered already, so a plain query-string read on mount is simpler and needs none of that.
  const [editScheduleId, setEditScheduleId] = useState<string | undefined>(undefined)
  useEffect(() => {
    setEditScheduleId(new URLSearchParams(window.location.search).get('editSchedule') || undefined)
  }, [])

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
        <SurveyAutomationPanel key={scheduleRefreshKey} initialEditScheduleId={editScheduleId} />
        <SurveyQuestionEditor />
        <CustomSurveyPanel />
        <UploadedFilesPanel />
        <SurveySendLogPanel />
      </div>
    </div>
  )
}
