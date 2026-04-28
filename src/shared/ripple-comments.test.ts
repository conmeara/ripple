import { describe, expect, test } from "bun:test"
import {
  getRippleRevisionPreviewProjectId,
  normalizeCommentAnchor,
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

  test("round-trips revision preview protocol keys", () => {
    const key = getRippleRevisionPreviewProjectId("rev_123")
    expect(key).toBe("revision-rev_123")
    expect(parseRippleRevisionPreviewProjectId(key)).toBe("rev_123")
    expect(parseRippleRevisionPreviewProjectId("project_123")).toBeNull()
  })
})
