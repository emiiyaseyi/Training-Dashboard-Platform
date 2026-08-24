'use client'

import { HelpCircle, Mail, LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-slate-100 last:border-0 py-3">
      <p className="text-sm font-medium text-slate-800">{q}</p>
      <p className="text-sm text-slate-500 mt-1">{a}</p>
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Help & FAQ" subtitle="How the platform works, and who to contact if something looks wrong" />

      <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <SectionCard icon={Mail} title="Survey Emails" description="Pre-, Post-1, and Post-2 training surveys" defaultOpen>
          <div>
            <FAQItem
              q="I received a survey link by email — is it safe to use?"
              a="Yes. Each link is unique to you and the training you attended, and works without a separate login. Don't forward it — anyone with the link can submit on your behalf."
            />
            <FAQItem
              q="What are the three survey stages?"
              a="Pre-Training (sent before the course starts, asks what you hope to learn), Post-1 (sent shortly after the course ends, asks about relevance and application — filled by you), and Post-2 (sent about a month later, a manager review of how the training's been applied — filled by your line manager)."
            />
            <FAQItem
              q="Why does my link say the survey has expired?"
              a="Survey links stop accepting responses a set number of days after they're sent (7 by default) if left unfilled. If you still need to respond, contact L&D and ask them to resend it — resending resets the expiry clock."
            />
            <FAQItem
              q="I already filled this out — why did I get another email?"
              a="That's a reminder for a survey you haven't completed yet, or an admin manually resent it. If you're certain you've already submitted it and keep getting reminders, let L&D know."
            />
          </div>
        </SectionCard>

        <SectionCard icon={LayoutDashboard} title="Dashboard Pages" description="What each analytics page shows">
          <div>
            <FAQItem q="Executive Overview" a="Group-wide totals: learning investment, formal training vs. strategic learnings vs. subscriptions, staff coverage, impact scores, and business unit performance — always shows full organisation data regardless of your assigned access." />
            <FAQItem q="Training Analytics" a="Detailed training spend, hours, and participation, scoped to the Business Unit(s) you have access to." />
            <FAQItem q="Subscriptions" a="Professional membership spend and coverage by Business Unit." />
            <FAQItem q="Business Units" a="A deep-dive profile per Business Unit — investment split, coverage, budget utilisation, and impact." />
            <FAQItem q="Capability Coverage" a="What share of staff have been trained in each tracked Differentiating Capability." />
            <FAQItem q="Yet to Attend Training" a="Confirmed staff on the roster with no training record in the selected period." />
            <FAQItem q="Talent Members" a="Coverage and completion for the Talent Member (TM) population specifically: who's attended a TM training, who's exempted, and who's still due." />
            <FAQItem q="Report Generation" a="Generates a monthly snapshot report (Business Unit or group-wide) you can save and refer back to later." />
            <FAQItem q="Upload & Data" a="Where Training, Feedback, Subscription, KSS, Staff Roster, and Manager Review spreadsheets are uploaded." />
          </div>
        </SectionCard>

        <SectionCard icon={HelpCircle} title="Access & Accounts">
          <div>
            <FAQItem
              q="Why can't I see a page other people can?"
              a="Page access is assigned per person by a Super Admin, and can be view-only, view + export, or full admin per page. If you need access to something, ask your admin to update your permissions under Admin → Users."
            />
            <FAQItem
              q="How do I change my password?"
              a="Go to Account (bottom of the sidebar) → Change Password."
            />
            <FAQItem
              q="The numbers on my dashboard look wrong — who do I ask?"
              a="Reach out to your L&D/Admin team — they can check the underlying uploaded data."
            />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
