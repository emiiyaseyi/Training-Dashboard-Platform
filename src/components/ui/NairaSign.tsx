import type { LucideProps } from 'lucide-react'

export function NairaSign({ size = 24, className, color, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Left vertical bar */}
      <line x1="6" y1="4" x2="6" y2="20" />
      {/* Right vertical bar */}
      <line x1="18" y1="4" x2="18" y2="20" />
      {/* Top diagonal stroke */}
      <line x1="6" y1="6" x2="18" y2="18" />
      {/* Upper horizontal crossbar */}
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      {/* Lower horizontal crossbar */}
      <line x1="4" y1="14.5" x2="20" y2="14.5" />
    </svg>
  )
}
