import type { RippleActivitySummary } from "../../../shared/ripple-activity"
import { hasRippleActivityBadge, type RippleActivityBadgeState } from "../../../shared/ripple-activity"
import {
  acknowledgeActivitySummary,
  isActivityAcknowledged,
  type ActivityAcknowledgementRecords,
} from "../ripple-shell/activity-acknowledgements"

export function getCompositionActivityBadgeState(input: {
  summary: RippleActivitySummary | null | undefined
  acknowledgementRecords: ActivityAcknowledgementRecords
}): RippleActivityBadgeState | null {
  if (!hasRippleActivityBadge(input.summary)) return null
  if (isActivityAcknowledged(input.acknowledgementRecords, input.summary)) {
    return null
  }
  if (input.summary!.needsAttention > 0) return "needsAttention"
  if (input.summary!.ready > 0) return "ready"
  if (input.summary!.working > 0) return "working"
  return null
}

export function acknowledgeCompositionActivity(input: {
  summary: RippleActivitySummary | null | undefined
  acknowledgementRecords: ActivityAcknowledgementRecords
}): ActivityAcknowledgementRecords {
  return acknowledgeActivitySummary(
    input.acknowledgementRecords,
    input.summary,
  )
}
