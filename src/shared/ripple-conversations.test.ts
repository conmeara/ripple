import { describe, expect, test } from "bun:test"
import {
  normalizeConversationTitleCandidate,
  titleFromConversationBody,
} from "./ripple-conversations"

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

  test("cleans polite request prefixes from deterministic titles", () => {
    expect(titleFromConversationBody("Can you make the lower third feel more premium?")).toBe(
      "Make the lower third feel more premium",
    )
  })

  test("drops low-signal timing detail from deterministic titles", () => {
    expect(titleFromConversationBody("Make the logo bounce on beat 3")).toBe(
      "Make the logo bounce",
    )
  })

  test("uses composition context for vague first messages", () => {
    expect(
      titleFromConversationBody("can you fix this?", {
        compositionName: "Lower Third",
      }),
    ).toBe("Fix Lower Third")
  })

  test("normalizes title candidates", () => {
    expect(normalizeConversationTitleCandidate('"Title: Premium Lower Third."')).toBe(
      "Premium Lower Third",
    )
    expect(normalizeConversationTitleCandidate(" \n ")).toBeNull()
  })
})
