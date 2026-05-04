import * as React from "react"
import { cn } from "../../lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export function Logo({ className, fill, style, ...props }: LogoProps) {
  return (
    <svg
      viewBox="120 120 784 784"
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
      <style>
        {`
          .ripple-logo-mark {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.16));
          }

          .ripple-logo-playhead {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
          }

          .dark .ripple-logo-mark {
            filter: drop-shadow(0 0 11px rgba(255, 255, 255, 0.42)) drop-shadow(0 14px 16px rgba(0, 0, 0, 0.34));
          }

          .dark .ripple-logo-playhead {
            filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.48)) drop-shadow(0 18px 20px rgba(0, 0, 0, 0.34));
          }
        `}
      </style>
      <g
        className="ripple-logo-mark"
        stroke="currentColor"
        strokeWidth="56"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M360 390L254 512L360 634" />
        <path d="M664 390L770 512L664 634" />
      </g>
      <rect className="ripple-logo-playhead" x="480" y="154" width="64" height="716" rx="32" fill="currentColor" />
    </svg>
  )
}
