import type { RippleCommentFilter } from "../../../shared/ripple-comments"

export const commentFilterLabels: Record<RippleCommentFilter, string> = {
  active: "Comments",
  resolved: "Resolved",
  deleted: "Deleted",
  all: "All visible",
}

export function shouldShowRestoreAction(filter: RippleCommentFilter): boolean {
  return filter === "deleted"
}
