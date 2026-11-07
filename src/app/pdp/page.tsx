'use client'

import { PDPCyclePanel } from '@/components/admin/PDPCyclePanel'

// Thin wrapper — the actual cycle management UI lives in PDPCyclePanel so it can also be
// embedded directly in Admin → PDP Admin Settings (rather than that tab just linking away to
// this separate page).
export default function PDPPage() {
  return <PDPCyclePanel />
}
