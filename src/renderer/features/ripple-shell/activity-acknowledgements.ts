import type {
  RippleActivityScopeKind,
  RippleActivitySummary,
} from "../../../shared/ripple-activity"

export type ActivityAcknowledgementRecords = Record<string, string>

const STORAGE_PREFIX = "ripple-activity-acknowledgements"

export function activityAcknowledgementKey(input: {
  projectId: string
  scopeKind: RippleActivityScopeKind
  scopeId: string
}): string {
  return `${input.projectId}:${input.scopeKind}:${input.scopeId}`
}

export function isActivityAcknowledged(
  records: ActivityAcknowledgementRecords,
  summary: RippleActivitySummary | null | undefined,
): boolean {
  if (!summary) return true
  return records[activityAcknowledgementKey(summary)] === summary.activitySignature
}

export function acknowledgeActivitySummary(
  records: ActivityAcknowledgementRecords,
  summary: RippleActivitySummary | null | undefined,
): ActivityAcknowledgementRecords {
  if (!summary) return records
  return {
    ...records,
    [activityAcknowledgementKey(summary)]: summary.activitySignature,
  }
}

export function activityAcknowledgementStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}`
}

export function loadActivityAcknowledgements(
  projectId: string,
): ActivityAcknowledgementRecords {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(activityAcknowledgementStorageKey(projectId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    )
  } catch {
    return {}
  }
}

export function saveActivityAcknowledgements(
  projectId: string,
  records: ActivityAcknowledgementRecords,
): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    activityAcknowledgementStorageKey(projectId),
    JSON.stringify(records),
  )
}
