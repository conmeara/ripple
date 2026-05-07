import * as React from "react"
import { cn } from "../../lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export function Logo({ className, fill, style, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 560 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full text-[#050505] dark:text-white", className)}
      style={{
        ...style,
        ...(fill ? { color: fill } : null),
      }}
      aria-label="Ripple logo"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="31"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M197 213L139 280L197 347" />
        <path d="M363 213L421 280L363 347" />
      </g>
      <rect x="262" y="84" width="36" height="392" rx="18" fill="currentColor" />
    </svg>
  )
}
