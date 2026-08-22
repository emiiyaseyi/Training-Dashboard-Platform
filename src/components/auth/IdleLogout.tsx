'use client'

import { useEffect, useRef } from 'react'
import { signOut } from 'next-auth/react'

// Signs the user out after 30s of no activity, OR 30s of the tab being hidden/unfocused —
// whichever happens first. Mounted only inside the authenticated shell (AppShell), never on
// /login or the public survey pages.
const IDLE_TIMEOUT_MS = 30_000

export function IdleLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const logout = () => signOut({ callbackUrl: '/login' })

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS)
    }

    const onActivity = () => {
      // Only real, on-tab activity resets the clock — a hidden/unfocused tab keeps counting down
      // toward logout regardless of background events.
      if (document.visibilityState === 'visible' && document.hasFocus()) arm()
    }

    const activityEvents: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    activityEvents.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onActivity)
    window.addEventListener('focus', onActivity)
    window.addEventListener('blur', arm) // losing focus starts its own countdown rather than pausing

    arm()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity))
      document.removeEventListener('visibilitychange', onActivity)
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('blur', arm)
    }
  }, [])

  return null
}
