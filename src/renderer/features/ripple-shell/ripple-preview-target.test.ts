import { describe, expect, test } from "bun:test"
import {
  getActiveRipplePreviewChatId,
  getActiveRipplePreviewRevisionId,
  resetRipplePreviewTarget,
  selectRippleChatDraftPreview,
  selectRippleCommentPreview,
  selectRippleMainPreview,
  selectRippleProjectChatPreview,
  selectRippleRevisionChatPreview,
  selectRippleRevisionPreview,
} from "./ripple-preview-target"

describe("Ripple preview target transitions", () => {
  test("selects comment-generated changes at the exact anchored time", () => {
    const transition = selectRippleCommentPreview({
      threadId: "thread-1",
      revisionId: "revision-1",
      time: 91 / 30,
    })

    expect(transition).toEqual({
      selectedThreadId: "thread-1",
      seekTime: 91 / 30,
      target: {
        kind: "comment-revision",
        revisionId: "revision-1",
        seekTime: 91 / 30,
      },
    })
    expect(getActiveRipplePreviewRevisionId(transition.target)).toBe("revision-1")
    expect(getActiveRipplePreviewChatId(transition.target)).toBeNull()
  })

  test("keeps the frame anchor when a comment has no generated change yet", () => {
    const transition = selectRippleCommentPreview({
      threadId: "thread-2",
      revisionId: null,
      time: 3.25,
    })

    expect(transition).toEqual({
      selectedThreadId: "thread-2",
      seekTime: 3.25,
      target: { kind: "main" },
    })
  })

  test("switches between Main and comment previews without losing playhead time", () => {
    const comment = selectRippleRevisionPreview({
      revisionId: "revision-2",
      time: 4.5,
    })
    const main = selectRippleMainPreview({
      currentTime: comment.seekTime,
      requestedTime: null,
    })

    expect(comment.target).toEqual({
      kind: "comment-revision",
      revisionId: "revision-2",
      seekTime: 4.5,
    })
    expect(main).toEqual({
      target: { kind: "main" },
      seekTime: 4.5,
    })
  })

  test("opens comment conversations in Chat while preserving their revision preview", () => {
    expect(
      selectRippleRevisionChatPreview({
        revisionId: "revision-3",
        time: 6.75,
      }),
    ).toEqual({
      seekTime: 6.75,
      target: {
        kind: "comment-revision",
        revisionId: "revision-3",
        seekTime: 6.75,
      },
    })

    expect(
      selectRippleRevisionChatPreview({
        revisionId: null,
        time: 6.75,
      }),
    ).toEqual({
      seekTime: 6.75,
      target: { kind: "main" },
    })
  })

  test("previews chat drafts without changing the current timestamp", () => {
    const transition = selectRippleChatDraftPreview({
      chatId: "conversation-1",
      currentTime: 8.125,
    })

    expect(transition).toEqual({
      seekTime: 8.125,
      target: { kind: "chat-worktree", chatId: "conversation-1" },
    })
    expect(getActiveRipplePreviewChatId(transition.target)).toBe("conversation-1")
    expect(getActiveRipplePreviewRevisionId(transition.target)).toBeNull()
  })

  test("opening a normal project chat returns preview to Main at the same time", () => {
    expect(
      selectRippleProjectChatPreview({
        currentTime: 10.5,
      }),
    ).toEqual({
      seekTime: 10.5,
      target: { kind: "main" },
    })
  })

  test("resets project and composition switches to Main frame zero", () => {
    expect(resetRipplePreviewTarget()).toEqual({
      seekTime: 0,
      target: { kind: "main" },
    })
  })
})
