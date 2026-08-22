'use client'

import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'

// Signs the user out after N seconds of no activity, OR N seconds of the tab being hidden/
// unfocused — whichever happens first. N is admin-configurable (Admin → Security), defaulting to
// 90s. Mounted only inside the authenticated shell (AppShell), never on /login or public survey
// pages.
const DEFAULT_TIMEOUT_SECONDS = 90

export function IdleLogout() {
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_SECONDS * 1000)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/security-settings')
      .then((res) => res.json())
      .then((data) => {
        if (Number.isFinite(data?.idleTimeoutSeconds)) setTimeoutMs(data.idleTimeoutSeconds * 1000)
      })
      .catch(() => {}) // keep the default on failure — never block logout behavior on this fetch
  }, [])

  useEffect(() => {
    const logout = () => signOut({ callbackUrl: '/login' })

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(logout, timeoutMs)
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
  }, [timeoutMs])

  return null
}
