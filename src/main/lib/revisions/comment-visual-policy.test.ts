import { describe, expect, test } from "bun:test"
import { shouldCaptureCommentVisualContext } from "./comment-visual-policy"

describe("comment visual context policy", () => {
  test("captures visual context by default unless explicitly disabled or already attached", () => {
    expect(shouldCaptureCommentVisualContext({})).toBe(true)
    expect(shouldCaptureCommentVisualContext({ captureVisualContext: false })).toBe(false)
    expect(shouldCaptureCommentVisualContext({ captureVisualContext: true })).toBe(true)
    expect(shouldCaptureCommentVisualContext({
      captureVisualContext: true,
      screenshotPath: ".ripple/comment-visuals/thread-1/frame.png",
    })).toBe(false)
  })
})
