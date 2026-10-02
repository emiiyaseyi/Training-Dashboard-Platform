import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

interface ErrorStateProps {
  icon: LucideIcon
  iconClassName?: string
  title: string
  description: string
  href?: string
  linkLabel?: string
}

// Shared full-pane message for "nothing to render here" states — access-denied (403) and
// not-found (404) pages, and anywhere else that needs the same centered icon/title/body/link
// layout instead of duplicating it inline.
export function ErrorState({ icon: Icon, iconClassName = 'text-slate-300', title, description, href, linkLabel }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
      <Icon className={`w-10 h-10 mb-3 ${iconClassName}`} />
      <p className="text-slate-700 font-medium">{title}</p>
      <p className="text-slate-500 text-sm mt-1 max-w-sm">{description}</p>
      {href && (
        <Link href={href} className="mt-4 text-xs font-medium text-meristem-700 hover:text-meristem-800">
          {linkLabel || 'Go back'}
        </Link>
      )}
    </div>
  )
}
