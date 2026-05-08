import type {
  RippleCommentThreadStatus,
  RippleRevisionStatus,
} from "./ripple-comments"

export type RippleActivityScopeKind = "composition" | "sequence"
export type RippleActivityBadgeState = "working" | "ready" | "needsAttention"

export interface RippleActivitySource {
  projectId: string
  scopeKind: RippleActivityScopeKind
  scopeId: string
  threadStatus: RippleCommentThreadStatus
  threadUpdatedAt?: Date | string | number | null
  latestRevisionStatus?: RippleRevisionStatus | null
  latestRevisionUpdatedAt?: Date | string | number | null
}

export interface RippleActivitySummary {
  projectId: string
  scopeKind: RippleActivityScopeKind
  scopeId: string
  working: number
  ready: number
  needsAttention: number
  open: number
  latestActivityAt: string | null
  activitySignature: string
}

const WORKING_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "queued",
  "preparing",
  "running",
  "updating",
])

export function getRippleRevisionActivityState(
  status: RippleRevisionStatus | null | undefined,
): RippleActivityBadgeState | null {
  if (!status) return null
  if (WORKING_REVISION_STATUSES.has(status)) return "working"
  if (status === "proposed") return "ready"
  if (status === "failed" || status === "needs_update") return "needsAttention"
  return null
}

export function hasRippleActivityBadge(
  summary: RippleActivitySummary | null | undefined,
): boolean {
  if (!summary) return false
  return (
    summary.working > 0 ||
    summary.ready > 0 ||
    summary.needsAttention > 0
  )
}

export function buildRippleActivitySignature(input: {
  latestActivityAt: string | null
  working: number
  ready: number
  needsAttention: number
  open: number
}): string {
  return [
    `working:${input.working}`,
    `ready:${input.ready}`,
    `needs:${input.needsAttention}`,
    `open:${input.open}`,
  ].join("|")
}

export function summarizeRippleActivity(
  sources: RippleActivitySource[],
): RippleActivitySummary[] {
  const summaries = new Map<string, RippleActivitySummary>()

  for (const source of sources) {
    const key = `${source.projectId}:${source.scopeKind}:${source.scopeId}`
    const current = summaries.get(key) ?? {
      projectId: source.projectId,
      scopeKind: source.scopeKind,
      scopeId: source.scopeId,
      working: 0,
      ready: 0,
      needsAttention: 0,
      open: 0,
      latestActivityAt: null,
      activitySignature: "",
    }

    if (source.threadStatus === "open") {
      current.open += 1
    }

    const badgeState = getRippleRevisionActivityState(source.latestRevisionStatus)
    if (badgeState === "working") current.working += 1
    else if (badgeState === "ready") current.ready += 1
    else if (badgeState === "needsAttention") current.needsAttention += 1

    const latestActivityAt = latestIsoDate([
      current.latestActivityAt,
      source.threadUpdatedAt,
      source.latestRevisionUpdatedAt,
    ])
    current.latestActivityAt = latestActivityAt
    current.activitySignature = buildRippleActivitySignature(current)
    summaries.set(key, current)
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.scopeKind !== b.scopeKind) return a.scopeKind.localeCompare(b.scopeKind)
    return a.scopeId.localeCompare(b.scopeId)
  })
}

function latestIsoDate(
  values: Array<Date | string | number | null | undefined>,
): string | null {
  let latest = 0
  for (const value of values) {
    const timestamp = toTimestamp(value)
    if (timestamp !== null && timestamp > latest) latest = timestamp
  }
  return latest > 0 ? new Date(latest).toISOString() : null
}

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string" && value.trim()) {
    const timestamp = new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }
  return null
}
