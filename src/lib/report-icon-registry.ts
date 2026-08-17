import {
  Users, Target, BarChart2, BadgeCheck, UserCheck, GraduationCap,
  CreditCard, CheckCircle, Star, Award, ShieldCheck, Clock, Timer, Building2,
} from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import type { IconSpec } from './icon-rasterizer'

// Every icon badge used across the 7 report slides — rasterized once per export and reused by
// every slide builder, keyed by these names.
export const REPORT_ICON_SPECS: IconSpec[] = [
  { key: 'nairaSign', icon: NairaSign, variant: 'circle' },
  { key: 'graduationCap', icon: GraduationCap, variant: 'circle' },
  { key: 'award', icon: Award, variant: 'circle' },
  { key: 'badgeCheck', icon: BadgeCheck, variant: 'circle' },
  { key: 'users', icon: Users, variant: 'circle' },
  { key: 'userCheck', icon: UserCheck, variant: 'circle' },
  { key: 'star', icon: Star, variant: 'circle' },
  { key: 'barChart2', icon: BarChart2, variant: 'circle' },
  { key: 'creditCard', icon: CreditCard, variant: 'circle' },
  { key: 'target', icon: Target, variant: 'circle' },
  { key: 'checkCircle', icon: CheckCircle, variant: 'circle' },
  { key: 'shieldCheck', icon: ShieldCheck, variant: 'circle' },
  { key: 'clock', icon: Clock, variant: 'circle' },
  { key: 'timer', icon: Timer, variant: 'circle' },
  { key: 'building2', icon: Building2, variant: 'square' },
]
