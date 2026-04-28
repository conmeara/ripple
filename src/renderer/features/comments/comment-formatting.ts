import { msToSeconds, type RippleRevisionDiffSummary } from "../../../shared/ripple-comments"
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

export function formatRevisionResultLine(
  summary: RippleRevisionDiffSummary | null,
): string {
  if (summary?.summary) return summary.summary
  if (!summary || summary.fileCount === 0) {
    return "Agent finished without project changes."
  }
  const fileLabel = summary.fileCount === 1 ? "file" : "files"
  if (summary.additions || summary.deletions) {
    return `Updated ${summary.fileCount} ${fileLabel}, +${summary.additions}/-${summary.deletions}.`
  }
  return `Updated ${summary.fileCount} ${fileLabel}.`
}
