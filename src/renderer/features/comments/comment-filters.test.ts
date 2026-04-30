import { describe, expect, test } from "bun:test"
import type { RippleRevisionView } from "../../../shared/ripple-comments"
import {
  canPreviewRevisionChanges,
  canRefreshRevisionChanges,
  canReplyToCommentThread,
  hasActiveRevisionChanges,
  isRevisionResolvingAgainstLatest,
} from "./comment-filters"

function revision(
  status: RippleRevisionView["status"],
  diffSummary: string | null = null,
): RippleRevisionView {
  return {
    id: "revision-1",
    threadId: "thread-1",
    projectId: "project-1",
    compositionId: null,
    chatId: "chat-1",
    subChatId: "subchat-1",
    status,
    previewContextKey: "revision-revision-1",
    diffSummary,
    errorMessage: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
  }
}

describe("comment filter helpers", () => {
  test("keeps deleted comments out of preview and reply flows", () => {
    const proposed = revision("proposed")

    expect(canPreviewRevisionChanges(proposed)).toBe(true)
    expect(canPreviewRevisionChanges(proposed, { deleted: true })).toBe(false)
    expect(canRefreshRevisionChanges(proposed, { deleted: true })).toBe(false)
    expect(canReplyToCommentThread({ deletedAt: new Date() })).toBe(false)
  })

  test("treats stale update work as resolving instead of previewable", () => {
    const queuedUpdate = revision("queued", JSON.stringify({ fileCount: 1 }))

    expect(isRevisionResolvingAgainstLatest(queuedUpdate)).toBe(true)
    expect(canPreviewRevisionChanges(queuedUpdate)).toBe(false)
    expect(canPreviewRevisionChanges(revision("queued"))).toBe(false)
    expect(canPreviewRevisionChanges(revision("running"))).toBe(false)
    expect(canPreviewRevisionChanges(revision("accepted"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("rejected"))).toBe(false)
  })

  test("detects active generated changes for view refresh polling", () => {
    expect(hasActiveRevisionChanges({ revisions: [revision("running")] })).toBe(true)
    expect(hasActiveRevisionChanges({ revisions: [revision("updating")] })).toBe(true)
    expect(hasActiveRevisionChanges({ revisions: [revision("proposed")] })).toBe(false)
  })
})
