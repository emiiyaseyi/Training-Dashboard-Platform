import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

type Variant = 'success' | 'warning' | 'error' | 'info'

interface AlertBadgeProps {
  variant: Variant
  message: string
}

const variantMap = {
  success: { icon: CheckCircle, classes: 'bg-green-50 border-green-200 text-green-800', iconClass: 'text-green-500' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-amber-800', iconClass: 'text-amber-500' },
  error:   { icon: XCircle, classes: 'bg-red-50 border-red-200 text-red-800', iconClass: 'text-red-500' },
  info:    { icon: Info, classes: 'bg-blue-50 border-blue-200 text-blue-800', iconClass: 'text-blue-500' },
}

export function AlertBadge({ variant, message }: AlertBadgeProps) {
  const { icon: Icon, classes, iconClass } = variantMap[variant]
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${classes}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
      <span>{message}</span>
    </div>
  )
}
