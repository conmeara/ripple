import {
  msToSeconds,
  type RippleRevisionDiffSummary,
  type RippleRevisionStatus,
  type RippleRevisionView,
} from "../../../shared/ripple-comments"
import { formatTimelineTimecode } from "../../../shared/hyperframes-timeline-model"

export function formatCommentTimecode(
  startTimeMs: number,
  endTimeMs?: number | null,
): string {
  const start = formatTimelineTimecode(msToSeconds(startTimeMs))
  if (endTimeMs === null || endTimeMs === undefined || endTimeMs <= startTimeMs) {
    return start
  }

  return `${start} - ${formatTimelineTimecode(msToSeconds(endTimeMs))}`
}

export function formatCommentRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return "Just now"
  const date = value instanceof Date ? value : new Date(value)
  const elapsed = Date.now() - date.getTime()
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now"
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function parseRevisionDiffSummary(
  value: string | null | undefined,
): RippleRevisionDiffSummary | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<RippleRevisionDiffSummary>
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : undefined
    return {
      fileCount: Number(parsed.fileCount ?? 0),
      additions: Number(parsed.additions ?? 0),
      deletions: Number(parsed.deletions ?? 0),
      files: Array.isArray(parsed.files)
        ? parsed.files.filter((file): file is string => typeof file === "string")
        : [],
      ...(summary ? { summary } : {}),
    }
  } catch {
    return null
  }
}

export function compactCommentLine(
  value: string,
  maxLength: number | null = 160,
): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (maxLength === null) return compact
  if (compact.length <= maxLength) return compact

  const sliceLength = Math.max(0, maxLength - 3)
  return `${compact.slice(0, sliceLength).trimEnd()}...`
}

export function formatRevisionResultLine(
  summary: RippleRevisionDiffSummary | null,
  options: { maxLength?: number | null } = {},
): string | null {
  if (summary?.summary) {
    const maxLength = Object.prototype.hasOwnProperty.call(options, "maxLength")
      ? options.maxLength ?? null
      : 160
    return compactCommentLine(summary.summary, maxLength)
  }
  return null
}

const REVISION_STATUSES_WITH_SUMMARY_LINES = new Set<RippleRevisionStatus>([
  "queued",
  "preparing",
  "running",
  "updating",
  "needs_update",
  "proposed",
  "answered",
  "accepted",
  "superseded",
])

export function isWorkingRevisionStatus(status: RippleRevisionStatus): boolean {
  return status === "queued" || status === "preparing" || status === "running"
}

function canShowRevisionSummaryLine(
  revision: RippleRevisionView,
  summary: RippleRevisionDiffSummary | null,
): boolean {
  return Boolean(summary) && REVISION_STATUSES_WITH_SUMMARY_LINES.has(revision.status)
}

export function revisionStatusLabel(status: RippleRevisionStatus): string {
  switch (status) {
    case "queued":
      return "Agent is thinking"
    case "preparing":
      return "Preparing the composition"
    case "running":
      return "Editing files"
    case "updating":
      return "Updating against Main"
    case "needs_update":
      return "Refresh needed"
    case "proposed":
      return "Changes ready"
    case "answered":
      return "No changes needed"
    case "accepted":
      return "Accepted"
    case "rejected":
      return "Changes rejected"
    case "superseded":
      return "Updated by a newer reply"
    case "failed":
      return "Needs attention"
  }
}

export function formatRevisionStatusLine(revision: RippleRevisionView): string {
  const summary = parseRevisionDiffSummary(revision.diffSummary)
  const label = revisionStatusLabel(revision.status)
  const resultLine = canShowRevisionSummaryLine(revision, summary)
    ? formatRevisionResultLine(summary, { maxLength: null }) ?? label
    : label

  return revision.status === "failed"
    ? revision.errorMessage || revisionStatusLabel(revision.status)
    : resultLine
}
