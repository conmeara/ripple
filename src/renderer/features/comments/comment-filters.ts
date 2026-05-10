import type {
  RippleCommentFilter,
  RippleCommentThreadView,
  RippleRevisionStatus,
  RippleRevisionView,
} from "../../../shared/ripple-comments"

export const commentFilterLabels: Record<RippleCommentFilter, string> = {
  active: "Comments",
  resolved: "Accepted",
  deleted: "Rejected",
  all: "All visible",
}

export function shouldShowRestoreAction(filter: RippleCommentFilter): boolean {
  return filter === "deleted"
}

const PREVIEWABLE_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "proposed",
  "needs_update",
  "accepted",
])

const LIVE_PREVIEWABLE_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "queued",
  "preparing",
  "running",
  "updating",
])

const RESOLVING_REVISION_STATUSES = new Set<RippleRevisionStatus>([
  "queued",
  "preparing",
  "running",
  "updating",
])

export function isDeletedCommentThread(
  thread: Pick<RippleCommentThreadView, "deletedAt">,
): boolean {
  return Boolean(thread.deletedAt)
}

export function isRevisionResolvingAgainstLatest(
  revision: RippleRevisionView,
): boolean {
  return revision.status === "updating" || (
    Boolean(revision.diffSummary) &&
    RESOLVING_REVISION_STATUSES.has(revision.status)
  )
}

export function canPreviewRevisionChanges(
  revision: RippleRevisionView | null | undefined,
  options: { deleted?: boolean } = {},
): boolean {
  if (!revision || options.deleted) return false
  if (
    LIVE_PREVIEWABLE_REVISION_STATUSES.has(revision.status) &&
    revision.previewContextKey
  ) {
    return true
  }
  if (isRevisionResolvingAgainstLatest(revision)) return false
  return PREVIEWABLE_REVISION_STATUSES.has(revision.status)
}

export function hasActiveRevisionChanges(
  thread: Pick<RippleCommentThreadView, "revisions">,
): boolean {
  return thread.revisions.some((revision) =>
    RESOLVING_REVISION_STATUSES.has(revision.status),
  )
}

export function canRefreshRevisionChanges(
  revision: RippleRevisionView | null | undefined,
  options: { deleted?: boolean } = {},
): boolean {
  return Boolean(
    revision &&
      !options.deleted &&
      (
        revision.status === "needs_update" ||
        revision.status === "failed"
      ),
  )
}

export function canRejectRevisionChanges(
  revision: RippleRevisionView | null | undefined,
  options: { deleted?: boolean } = {},
): boolean {
  return Boolean(
    revision &&
      !options.deleted &&
      revision.status === "proposed",
  )
}

export function canReplyToCommentThread(
  thread: Pick<RippleCommentThreadView, "deletedAt">,
): boolean {
  return !isDeletedCommentThread(thread)
}
