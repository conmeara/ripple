import { describe, expect, test } from "bun:test"
import {
  getRippleCommentRevisionId,
  isRippleCommentInitialMessage,
  shouldAutoGenerateInitialMessage,
} from "./auto-generate"

describe("chat auto-generate guard", () => {
  test("lets normal one-message chats auto-start", () => {
    expect(
      shouldAutoGenerateInitialMessage({
        messages: [{ role: "user", parts: [{ type: "text", text: "Make it pop" }] }],
        status: "ready",
        streamId: null,
        hasTriggered: false,
      }),
    ).toBe(true)
  })

  test("lets comment-created chats enter the shared revision-run claim path", () => {
    const message = {
      role: "user",
      parts: [{ type: "text", text: "Review context..." }],
      metadata: { source: "ripple-comment", revisionId: "rev-1" },
    }

    expect(isRippleCommentInitialMessage(message)).toBe(true)
    expect(getRippleCommentRevisionId(message)).toBe("rev-1")
    expect(
      shouldAutoGenerateInitialMessage({
        messages: [message],
        status: "ready",
        streamId: null,
        hasTriggered: false,
      }),
    ).toBe(true)
  })

  test("does not auto-start resumed or already-triggered chats", () => {
    const messages = [{ role: "user", parts: [{ type: "text", text: "Continue" }] }]

    expect(
      shouldAutoGenerateInitialMessage({
        messages,
        status: "ready",
        streamId: "stream-1",
        hasTriggered: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoGenerateInitialMessage({
        messages,
        status: "ready",
        streamId: null,
        hasTriggered: true,
      }),
    ).toBe(false)
  })
})
