import { describe, expect, test } from "bun:test"
import { titleFromConversationBody } from "./ripple-conversations"

describe("Ripple conversation helpers", () => {
  test("derives compact titles from the first user message", () => {
    expect(titleFromConversationBody("  Make the title pop harder  ")).toBe(
      "Make the title pop harder",
    )
    expect(
      titleFromConversationBody(
        "Make the intro lower third feel more editorial and less tech demo.",
      ),
    ).toBe("Make the intro lower third feel more...")
  })

  test("falls back to a new chat title for blank input", () => {
    expect(titleFromConversationBody(" \n\t ")).toBe("New Chat")
  })
})
