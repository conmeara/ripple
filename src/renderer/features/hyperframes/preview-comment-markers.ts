import {
  commentAnchorPreviewTimeSeconds,
  type RippleCommentThreadView,
  type RippleRevisionStatus,
  type RippleRevisionView,
} from "../../../shared/ripple-comments"
import { formatTimelineTimecode } from "../../../shared/hyperframes-timeline-model"

export type PreviewCommentMarkerTone =
  | "draft"
  | "in-progress"
  | "needs-input"
  | "done"

export interface PreviewCommentMarker {
  id: string
  time: number
  positionPercent: number
  tone: PreviewCommentMarkerTone
  label: string
  previewRevisionId: string | null
}

export const PREVIEW_COMMENT_MARKER_TONE_CLASSNAMES: Record<
  PreviewCommentMarkerTone,
  string
> = {
  draft: "bg-muted-foreground/55",
  "in-progress": "bg-blue-500",
  "needs-input": "bg-amber-500",
  done: "bg-emerald-500",
}

export const PREVIEW_COMMENT_MARKER_HALO_CLASSNAMES: Record<
  PreviewCommentMarkerTone,
  string
> = {
  draft: "bg-muted-foreground/15",
  "in-progress": "bg-blue-500/20",
  "needs-input": "bg-amber-500/20",
  done: "bg-emerald-500/20",
}

const WORKING_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "queued",
  "preparing",
  "running",
  "updating",
])

const PREVIEWABLE_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "proposed",
  "accepted",
])

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function latestPreviewCommentRevision(
  thread: RippleCommentThreadView,
): RippleRevisionView | null {
  if (thread.latestRevisionId) {
    return thread.revisions.find((revision) => revision.id === thread.latestRevisionId) ?? null
  }

  return thread.revisions[thread.revisions.length - 1] ?? null
}

export function previewCommentMarkerTone(
  thread: RippleCommentThreadView,
): PreviewCommentMarkerTone {
  const revision = latestPreviewCommentRevision(thread)

  if (revision && WORKING_REVISION_STATUSES.has(revision.status)) {
    return "in-progress"
  }

  if (revision?.status === "failed") {
    return "needs-input"
  }

  if (
    thread.status === "resolved" ||
    revision?.status === "proposed" ||
    revision?.status === "accepted"
  ) {
    return "done"
  }

  return "draft"
}

export function hasActivePreviewCommentMarkerWork(
  thread: Pick<RippleCommentThreadView, "revisions">,
): boolean {
  return thread.revisions.some((revision) =>
    WORKING_REVISION_STATUSES.has(revision.status),
  )
}

export function buildPreviewCommentMarkers(
  threads: RippleCommentThreadView[],
  durationSeconds: number,
): PreviewCommentMarker[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []

  return threads
    .filter((thread) => !thread.deletedAt && Number.isFinite(thread.startTime))
    .map((thread) => {
      const time = commentAnchorPreviewTimeSeconds(thread)
      const revision = latestPreviewCommentRevision(thread)
      return {
        id: thread.id,
        time,
        positionPercent: clampPercent((time / durationSeconds) * 100),
        tone: previewCommentMarkerTone(thread),
        label: `Comment at ${formatTimelineTimecode(time)}`,
        previewRevisionId:
          revision && PREVIEWABLE_REVISION_STATUSES.has(revision.status)
            ? revision.id
            : null,
      }
    })
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
}
