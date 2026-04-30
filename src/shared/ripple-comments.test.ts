import { describe, expect, test } from "bun:test"
import {
  commentAnchorPreviewTimeSeconds,
  getRippleChatWorktreePreviewProjectId,
  getRippleRevisionPreviewProjectId,
  normalizeCommentAnchor,
  parseRippleChatWorktreePreviewProjectId,
  parseRippleRevisionPreviewProjectId,
} from "./ripple-comments"

describe("Ripple comment helpers", () => {
  test("normalizes frame anchors from seconds to persisted milliseconds", () => {
    expect(normalizeCommentAnchor({ startTime: 1.25 })).toMatchObject({
      anchorType: "frame",
      startTimeMs: 1250,
      endTimeMs: null,
      startFrame: 38,
      endFrame: null,
    })
  })

  test("normalizes range and element anchors", () => {
    expect(
      normalizeCommentAnchor({
        startTime: 3,
        endTime: 1,
        clipKey: "index.html:title:0",
        elementSelector: "#title",
        sourceFile: "index.html",
      }),
    ).toMatchObject({
      anchorType: "element",
      startTimeMs: 1000,
      endTimeMs: 3000,
      clipKey: "index.html:title:0",
      elementSelector: "#title",
      sourceFile: "index.html",
    })
  })

  test("uses persisted frames for comment preview seeks when milliseconds are rounded", () => {
    expect(commentAnchorPreviewTimeSeconds({
      startTime: 3033,
      startFrame: 91,
    })).toBe(91 / 30)
    expect(commentAnchorPreviewTimeSeconds({
      startTime: 3000,
      startFrame: 0,
    })).toBe(3)
    expect(commentAnchorPreviewTimeSeconds({
      startTime: 3000,
      startFrame: 91,
    })).toBe(3)
  })

  test("round-trips revision preview protocol keys", () => {
    const key = getRippleRevisionPreviewProjectId("rev_123")
    expect(key).toBe("revision-rev_123")
    expect(parseRippleRevisionPreviewProjectId(key)).toBe("rev_123")
    expect(parseRippleRevisionPreviewProjectId("project_123")).toBeNull()
  })

  test("round-trips chat worktree preview protocol keys", () => {
    const key = getRippleChatWorktreePreviewProjectId("chat_123")
    expect(key).toBe("chat-worktree-chat_123")
    expect(parseRippleChatWorktreePreviewProjectId(key)).toBe("chat_123")
    expect(parseRippleChatWorktreePreviewProjectId("project_123")).toBeNull()
  })
})
