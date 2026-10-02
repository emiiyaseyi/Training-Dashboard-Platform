import { SearchX } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'

// Next.js renders this automatically for any URL that doesn't match a route, anywhere outside
// /hr (which has its own HR-branded version at src/app/hr/not-found.tsx).
export default function NotFound() {
  return (
    <ErrorState
      icon={SearchX}
      title="Page not found"
      description="The page you're looking for doesn't exist, or may have moved."
      href="/"
      linkLabel="Go to dashboard"
    />
  )
}
