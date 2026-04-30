import type { SVGProps } from "react"

export function RippleCommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 3v-15A2.5 2.5 0 0 1 6.5 3.5h11A2.5 2.5 0 0 1 20 6v9.5Z" />
      <path d="M8 9h8" />
      <path d="M8 12.5h5" />
    </svg>
  )
}
