import { SearchX } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'

// Matches hr/layout.tsx's meristem-themed "Access restricted" styling — used for any /hr/**
// URL that doesn't match a page, instead of falling through to the root app's not-found.tsx.
export default function HrNotFound() {
  return (
    <ErrorState
      icon={SearchX}
      iconClassName="text-meristem-200"
      title="Page not found"
      description="The HR page you're looking for doesn't exist, or may have moved."
      href="/hr"
      linkLabel="Go to HR dashboard"
    />
  )
}
