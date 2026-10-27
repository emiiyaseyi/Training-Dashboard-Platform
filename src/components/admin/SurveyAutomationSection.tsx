'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { SurveyAutomationPanel } from '@/components/admin/SurveyAutomationPanel'
import { SurveyQuestionEditor } from '@/components/admin/SurveyQuestionEditor'
import { CustomSurveyPanel } from '@/components/admin/CustomSurveyPanel'
import { SurveyResponseMirrorPanel } from '@/components/admin/SurveyResponseMirrorPanel'
import { TrainingDataMirrorPanel } from '@/components/admin/TrainingDataMirrorPanel'
import { SurveySendLogPanel } from '@/components/admin/SurveySendLogPanel'
import { SurveyInsightsPanel } from '@/components/admin/SurveyInsightsPanel'
import { AlreadyAttendedTrainingsPanel } from '@/components/admin/AlreadyAttendedTrainingsPanel'
import { UploadedFilesPanel } from '@/components/admin/UploadedFilesPanel'

// Survey Automation shown inside Admin Settings itself (same panels as the /admin/surveys page), so
// opening it never leaves the settings page. Collapsed by default; the panels only load once opened.
export function SurveyAutomationSection() {
  const [open, setOpen] = useState(false)
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-slate-50 rounded-xl"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Survey Automation</p>
            <p className="text-xs text-slate-500 mt-0.5">Training schedules, survey questions, send settings, mirror sheets and pre/post-training survey email triggers.</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 sm:p-5 space-y-6">
          <div className="flex justify-end">
            <Link href="/admin/surveys" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
              <ExternalLink className="w-3.5 h-3.5" /> Open as a full page
            </Link>
          </div>
          <SurveyInsightsPanel />
          <SurveyResponseMirrorPanel />
          <TrainingDataMirrorPanel />
          <AlreadyAttendedTrainingsPanel onScheduleCreated={() => setScheduleRefreshKey((k) => k + 1)} />
          <SurveyAutomationPanel key={scheduleRefreshKey} />
          <SurveyQuestionEditor />
          <CustomSurveyPanel />
          <UploadedFilesPanel />
          <SurveySendLogPanel />
        </div>
      )}
    </div>
  )
}
