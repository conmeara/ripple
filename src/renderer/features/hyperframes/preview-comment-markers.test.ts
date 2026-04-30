import { describe, expect, test } from "bun:test"
import type { RippleCommentThreadView } from "../../../shared/ripple-comments"
import {
  buildPreviewCommentMarkers,
  hasActivePreviewCommentMarkerWork,
  previewCommentMarkerTone,
} from "./preview-comment-markers"

function thread(
  overrides: Partial<RippleCommentThreadView> = {},
): RippleCommentThreadView {
  return {
    id: "thread-1",
    projectId: "project-1",
    compositionId: "composition-1",
    anchorType: "frame",
    startTime: 1_000,
    endTime: null,
    startFrame: 30,
    endFrame: null,
    elementSelector: null,
    clipKey: null,
    sourceFile: null,
    screenshotPath: null,
    clientRequestId: null,
    status: "open",
    latestRevisionId: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
    deletedAt: null,
    messages: [],
    revisions: [],
    ...overrides,
  }
}

describe("preview comment markers", () => {
  test("positions visible comments by their timecode", () => {
    const markers = buildPreviewCommentMarkers([
      thread({ id: "middle", startTime: 5_000 }),
      thread({ id: "start", startTime: 0 }),
      thread({ id: "past-end", startTime: 12_000 }),
    ], 10)

    expect(markers.map((marker) => marker.id)).toEqual([
      "start",
      "middle",
      "past-end",
    ])
    expect(markers.map((marker) => marker.positionPercent)).toEqual([
      0,
      50,
      100,
    ])
  })

  test("preserves frame-precise comment positions when stored milliseconds are rounded", () => {
    const markers = buildPreviewCommentMarkers([
      thread({ id: "frame-91", startTime: 3_033, startFrame: 91 }),
    ], 10)

    expect(markers[0]?.time).toBe(91 / 30)
    expect(markers[0]?.label).toBe("Comment at 00:00:03:01")
  })

  test("includes the revision preview to show when a marker is selected", () => {
    const markers = buildPreviewCommentMarkers([
      thread({
        revisions: [{
          id: "revision-1",
          threadId: "thread-1",
          projectId: "project-1",
          compositionId: "composition-1",
          chatId: null,
          subChatId: null,
          status: "proposed",
          previewContextKey: null,
          diffSummary: null,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          resolvedAt: null,
        }],
      }),
    ], 10)

    expect(markers[0]?.previewRevisionId).toBe("revision-1")
  })

  test("uses the Kanban status palette meanings for marker tones", () => {
    expect(previewCommentMarkerTone(thread())).toBe("draft")
    expect(previewCommentMarkerTone(thread({
      revisions: [{
        id: "revision-1",
        threadId: "thread-1",
        projectId: "project-1",
        compositionId: "composition-1",
        chatId: null,
        subChatId: null,
        status: "running",
        previewContextKey: null,
        diffSummary: null,
        errorMessage: null,
        createdAt: null,
        updatedAt: null,
        resolvedAt: null,
      }],
    }))).toBe("in-progress")
    expect(previewCommentMarkerTone(thread({
      revisions: [{
        id: "revision-1",
        threadId: "thread-1",
        projectId: "project-1",
        compositionId: "composition-1",
        chatId: null,
        subChatId: null,
        status: "failed",
        previewContextKey: null,
        diffSummary: null,
        errorMessage: null,
        createdAt: null,
        updatedAt: null,
        resolvedAt: null,
      }],
    }))).toBe("needs-input")
    expect(previewCommentMarkerTone(thread({ status: "resolved" }))).toBe("done")
  })

  test("does not render deleted comments or zero-duration scrubbers", () => {
    expect(buildPreviewCommentMarkers([
      thread({ deletedAt: new Date() }),
    ], 10)).toEqual([])
    expect(buildPreviewCommentMarkers([
      thread(),
    ], 0)).toEqual([])
  })

  test("detects comments whose marker color should refresh while work runs", () => {
    expect(hasActivePreviewCommentMarkerWork(thread())).toBe(false)
    expect(hasActivePreviewCommentMarkerWork(thread({
      revisions: [{
        id: "revision-1",
        threadId: "thread-1",
        projectId: "project-1",
        compositionId: "composition-1",
        chatId: null,
        subChatId: null,
        status: "queued",
        previewContextKey: null,
        diffSummary: null,
        errorMessage: null,
        createdAt: null,
        updatedAt: null,
        resolvedAt: null,
      }],
    }))).toBe(true)
  })
})
