import type { RippleRevisionStatus } from "../../../shared/ripple-comments"

const REUSABLE_FOLLOW_UP_STATUSES = [
  "queued",
  "preparing",
  "running",
  "proposed",
  "answered",
  "failed",
] as const

export function canReuseRevisionAsFollowUpBase(
  status: RippleRevisionStatus,
): boolean {
  return (REUSABLE_FOLLOW_UP_STATUSES as readonly string[]).includes(status)
}
