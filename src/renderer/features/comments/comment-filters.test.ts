import { describe, expect, test } from "bun:test"
import type { RippleRevisionView } from "../../../shared/ripple-comments"
import {
  canPreviewRevisionChanges,
  canRejectRevisionChanges,
  canRefreshRevisionChanges,
  canReplyToCommentThread,
  commentFilterLabels,
  hasActiveRevisionChanges,
  isRevisionResolvingAgainstLatest,
} from "./comment-filters"

function revision(
  status: RippleRevisionView["status"],
  diffSummary: string | null = null,
  previewContextKey: string | null = "revision-revision-1",
): RippleRevisionView {
  return {
    id: "revision-1",
    threadId: "thread-1",
    projectId: "project-1",
    compositionId: null,
    chatId: "chat-1",
    subChatId: "subchat-1",
    status,
    previewContextKey,
    diffSummary,
    errorMessage: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
  }
}

describe("comment filter helpers", () => {
  test("labels resolved comment threads as accepted in the UI", () => {
    expect(commentFilterLabels.resolved).toBe("Accepted")
  })

  test("keeps rejected comments out of preview and reply flows", () => {
    const proposed = revision("proposed")

    expect(canPreviewRevisionChanges(proposed)).toBe(true)
    expect(canPreviewRevisionChanges(proposed, { deleted: true })).toBe(false)
    expect(canRefreshRevisionChanges(proposed, { deleted: true })).toBe(false)
    expect(canReplyToCommentThread({ deletedAt: new Date() })).toBe(false)
  })

  test("previews live generated-change work once a revision workspace exists", () => {
    const queuedUpdate = revision("queued", JSON.stringify({ fileCount: 1 }))

    expect(isRevisionResolvingAgainstLatest(queuedUpdate)).toBe(true)
    expect(canPreviewRevisionChanges(queuedUpdate)).toBe(true)
    expect(canPreviewRevisionChanges(revision("queued"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("running"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("updating"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("preparing"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("needs_update"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("queued", null, null))).toBe(false)
    expect(canPreviewRevisionChanges(revision("preparing", null, null))).toBe(false)
    expect(canPreviewRevisionChanges(revision("accepted"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("answered"))).toBe(false)
    expect(canPreviewRevisionChanges(revision("rejected"))).toBe(false)
  })

  test("detects active generated changes for view refresh polling", () => {
    expect(hasActiveRevisionChanges({ revisions: [revision("running")] })).toBe(true)
    expect(hasActiveRevisionChanges({ revisions: [revision("updating")] })).toBe(true)
    expect(hasActiveRevisionChanges({ revisions: [revision("needs_update")] })).toBe(false)
    expect(hasActiveRevisionChanges({ revisions: [revision("proposed")] })).toBe(false)
  })

  test("allows explicit rejection only for live proposed changes", () => {
    expect(canRejectRevisionChanges(revision("proposed"))).toBe(true)
    expect(canRejectRevisionChanges(revision("proposed"), { deleted: true })).toBe(false)
    expect(canRejectRevisionChanges(revision("answered"))).toBe(false)
    expect(canRejectRevisionChanges(revision("accepted"))).toBe(false)
    expect(canRejectRevisionChanges(revision("rejected"))).toBe(false)
    expect(canRejectRevisionChanges(revision("needs_update"))).toBe(false)
    expect(canRejectRevisionChanges(revision("failed"))).toBe(false)
    expect(canRejectRevisionChanges(revision("running"))).toBe(false)
    expect(canRejectRevisionChanges(null)).toBe(false)
  })

  test("allows refresh but not rejection when a proposal needs updates or restart", () => {
    expect(canRefreshRevisionChanges(revision("needs_update"))).toBe(true)
    expect(canRefreshRevisionChanges(revision("failed"))).toBe(true)
    expect(canRefreshRevisionChanges(revision("needs_update"), { deleted: true })).toBe(false)
    expect(canRefreshRevisionChanges(revision("failed"), { deleted: true })).toBe(false)
    expect(canRejectRevisionChanges(revision("needs_update"))).toBe(false)
  })
})
