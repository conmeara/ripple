import { describe, expect, test } from "bun:test"
import {
  type RippleTimelineRangeSelection,
  RIPPLE_TIMELINE_FPS,
  timelineSecondsToFrame,
} from "../../../shared/hyperframes-timeline-model"
import {
  createInitialRipplePreviewContext,
  getActiveRipplePreviewChatId,
  getActiveRipplePreviewRevisionId,
  resolveRipplePreviewContextForProjectSelection,
  ripplePreviewContextReducer,
  type RipplePreviewContextState,
} from "./ripple-preview-context"

function reduce(
  state: RipplePreviewContextState,
  ...actions: Parameters<typeof ripplePreviewContextReducer>[1][]
): RipplePreviewContextState {
  return actions.reduce(ripplePreviewContextReducer, state)
}

function timelineSelection(
  compositionId: string,
): RippleTimelineRangeSelection {
  return {
    projectId: "project-1",
    compositionId,
    source: "static-source",
    confidence: "static",
    startTime: 1,
    endTime: 2,
    startFrame: 30,
    endFrame: 60,
  }
}

describe("Ripple preview context transitions", () => {
  test("selects comment-generated changes at the exact anchored time", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 91 / 30,
      },
    )

    expect(state.selectedCommentThreadId).toBe("thread-1")
    expect(state.time).toBe(91 / 30)
    expect(state.seekRequest).toEqual({ time: 91 / 30, requestId: 1 })
    expect(state.target).toEqual({
      kind: "comment-revision",
      revisionId: "revision-1",
      seekTime: 91 / 30,
    })
    expect(getActiveRipplePreviewRevisionId(state.target)).toBe("revision-1")
    expect(getActiveRipplePreviewChatId(state.target)).toBeNull()
  })

  test("keeps the frame anchor when a comment has no generated change yet", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-2",
        revisionId: null,
        time: 3.25,
      },
    )

    expect(state.selectedCommentThreadId).toBe("thread-2")
    expect(state.time).toBe(3.25)
    expect(state.target).toEqual({ kind: "main" })
  })

  test("clearing a comment preview returns to Main without losing playhead time", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 4.5,
      },
      { type: "clear-comment-preview" },
    )

    expect(state.selectedCommentThreadId).toBeNull()
    expect(state.time).toBe(4.5)
    expect(state.target).toEqual({ kind: "main" })
  })

  test("manual thread selection does not change the current preview source", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "preview-time-changed", time: 5 },
      { type: "preview-chat-draft", chatId: "conversation-1" },
      { type: "set-selected-comment-thread", threadId: "thread-1" },
    )

    expect(state.selectedCommentThreadId).toBe("thread-1")
    expect(state.time).toBe(5)
    expect(state.target).toEqual({ kind: "chat-worktree", chatId: "conversation-1" })
  })

  test("showing Main can preserve or clear selected comment state explicitly", () => {
    const selectedState = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 3,
      },
      { type: "show-main" },
    )

    expect(selectedState.selectedCommentThreadId).toBe("thread-1")
    expect(selectedState.target).toEqual({ kind: "main" })

    const clearedState = ripplePreviewContextReducer(selectedState, {
      type: "show-main",
      clearCommentSelection: true,
    })

    expect(clearedState.selectedCommentThreadId).toBeNull()
    expect(clearedState.time).toBe(3)
    expect(clearedState.target).toEqual({ kind: "main" })
  })

  test("opens comment conversations in Chat while preserving their revision preview", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "open-revision-chat",
        revisionId: "revision-3",
        time: 6.75,
      },
    )

    expect(state.time).toBe(6.75)
    expect(state.target).toEqual({
      kind: "comment-revision",
      revisionId: "revision-3",
      seekTime: 6.75,
    })

    const mainState = ripplePreviewContextReducer(state, {
      type: "open-revision-chat",
      revisionId: null,
      time: 6.75,
    })

    expect(mainState.time).toBe(6.75)
    expect(mainState.target).toEqual({ kind: "main" })
  })

  test("previews chat drafts without changing the current timestamp", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "preview-time-changed", time: 8.125 },
      { type: "preview-chat-draft", chatId: "conversation-1" },
    )

    expect(state.time).toBe(8.125)
    expect(state.target).toEqual({ kind: "chat-worktree", chatId: "conversation-1" })
    expect(getActiveRipplePreviewChatId(state.target)).toBe("conversation-1")
    expect(getActiveRipplePreviewRevisionId(state.target)).toBeNull()
  })

  test("opening a normal project chat returns preview to Main at the same time", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 10.5,
      },
      { type: "open-project-chat" },
    )

    expect(state.selectedCommentThreadId).toBeNull()
    expect(state.time).toBe(10.5)
    expect(state.target).toEqual({ kind: "main" })
  })

  test("composition switches preserve time while returning to Main", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 12.25,
      },
      {
        type: "composition-changed",
        projectId: "project-1",
        compositionId: "composition-2",
      },
    )

    expect(state.compositionId).toBe("composition-2")
    expect(state.selectedCommentThreadId).toBeNull()
    expect(state.time).toBe(12.25)
    expect(state.seekRequest).toEqual({ time: 12.25, requestId: 2 })
    expect(state.target).toEqual({ kind: "main" })
  })

  test("resolves composition switches synchronously for preview render props", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 4.25,
      },
    )

    const sameSelection = resolveRipplePreviewContextForProjectSelection(state, {
      projectId: "project-1",
      compositionId: "composition-1",
    })
    const nextSelection = resolveRipplePreviewContextForProjectSelection(state, {
      projectId: "project-1",
      compositionId: "composition-2",
    })

    expect(sameSelection).toBe(state)
    expect(nextSelection).not.toBe(state)
    expect(nextSelection.compositionId).toBe("composition-2")
    expect(nextSelection.target).toEqual({ kind: "main" })
    expect(nextSelection.selectedCommentThreadId).toBeNull()
    expect(nextSelection.seekRequest).toEqual({ time: 4.25, requestId: 2 })
  })

  test("composition switches retain only timeline selections from the new composition", () => {
    const retainedSelection = timelineSelection("composition-2")
    const retained = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "set-timeline-selection", selection: retainedSelection },
      {
        type: "composition-changed",
        projectId: "project-1",
        compositionId: "composition-2",
      },
    )

    expect(retained.timelineSelection).toEqual(retainedSelection)

    const staleSelection = timelineSelection("composition-1")
    const cleared = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "set-timeline-selection", selection: staleSelection },
      {
        type: "composition-changed",
        projectId: "project-1",
        compositionId: "composition-2",
      },
    )

    expect(cleared.timelineSelection).toBeNull()
  })

  test("preview time updates ignore loader zeroes during pending non-zero seeks", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 9,
      },
      { type: "preview-time-changed", time: 0 },
    )

    expect(state.time).toBe(9)
    expect(state.pendingSeekTime).toBe(9)
  })

  test("keeps review navigation anchored until the player lands there", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "preview-time-changed", time: 1.25 },
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 4,
      },
      { type: "preview-time-changed", time: 0 },
      { type: "preview-time-changed", time: 4, frame: 120, fps: 30 },
      { type: "preview-time-changed", time: 4.5, frame: 135, fps: 30 },
    )

    expect(state.selectedCommentThreadId).toBe("thread-1")
    expect(state.target).toEqual({
      kind: "comment-revision",
      revisionId: "revision-1",
      seekTime: 4,
    })
    expect(state.time).toBe(4.5)
    expect(state.frame).toBe(135)
    expect(state.pendingSeekTime).toBeNull()
  })

  test("preview time updates keep frame/fps while absorbing tiny player drift", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "preview-time-changed", time: 2 },
      {
        type: "preview-time-changed",
        time: 2.001,
        frame: 120,
        fps: 60,
      },
    )

    expect(state.time).toBe(2)
    expect(state.frame).toBe(120)
    expect(state.fps).toBe(60)
    expect(state.frame).toBe(timelineSecondsToFrame(state.time, RIPPLE_TIMELINE_FPS) * 2)
  })

  test("project switches still start from Main frame zero", () => {
    const state = reduce(
      createInitialRipplePreviewContext({
        projectId: "project-1",
        compositionId: "composition-1",
      }),
      { type: "preview-time-changed", time: 7.5 },
      {
        type: "composition-changed",
        projectId: "project-2",
        compositionId: "composition-3",
      },
    )

    expect(state.projectId).toBe("project-2")
    expect(state.compositionId).toBe("composition-3")
    expect(state.time).toBe(0)
    expect(state.frame).toBe(0)
    expect(state.target).toEqual({ kind: "main" })
  })
})
