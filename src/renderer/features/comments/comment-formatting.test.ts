import { describe, expect, test } from "bun:test"
import {
  compactCommentLine,
  formatRevisionResultLine,
  formatCommentRelativeTime,
  formatCommentTimecode,
  parseRevisionDiffSummary,
} from "./comment-formatting"

describe("comment formatting", () => {
  test("formats frame and range timecodes", () => {
    expect(formatCommentTimecode(0)).toBe("00:00:00:00")
    expect(formatCommentTimecode(1500, 2500)).toBe(
      "00:00:01:15 - 00:00:02:15",
    )
  })

  test("parses stored proposal summaries defensively", () => {
    expect(
      parseRevisionDiffSummary(
        JSON.stringify({
          fileCount: 2,
          additions: 10,
          deletions: 3,
          files: ["index.html", null, "compositions/title.html"],
          summary: "Updated title spacing.",
        }),
      ),
    ).toEqual({
      fileCount: 2,
      additions: 10,
      deletions: 3,
      files: ["index.html", "compositions/title.html"],
      summary: "Updated title spacing.",
    })
    expect(parseRevisionDiffSummary("nope")).toBeNull()
  })

  test("formats compact revision result lines from agent responses only", () => {
    expect(
      formatRevisionResultLine({
        fileCount: 1,
        additions: 4,
        deletions: 2,
        files: ["index.html"],
        summary: "Adjusted the lower-third exit.",
      }),
    ).toBe("Adjusted the lower-third exit.")
    expect(
      formatRevisionResultLine({
        fileCount: 2,
        additions: 10,
        deletions: 0,
        files: ["index.html", "style.css"],
      }),
    ).toBeNull()
    expect(
      formatRevisionResultLine({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        files: [],
      }),
    ).toBeNull()
  })

  test("compacts generated-change summaries for comment cards", () => {
    expect(compactCommentLine("  Updated\n\nthe title\tspacing.  ")).toBe(
      "Updated the title spacing.",
    )
    expect(compactCommentLine("abcdefghij", 8)).toBe("abcde...")
    expect(compactCommentLine("abcdefghij", null)).toBe("abcdefghij")
    expect(
      formatRevisionResultLine({
        fileCount: 1,
        additions: 1,
        deletions: 0,
        files: ["index.html"],
        summary: "Updated\n\nthe title\tspacing.",
      }),
    ).toBe("Updated the title spacing.")
    expect(
      formatRevisionResultLine({
        fileCount: 1,
        additions: 1,
        deletions: 0,
        files: ["index.html"],
        summary: "abcdefghij",
      }, { maxLength: null }),
    ).toBe("abcdefghij")
  })

  test("keeps fresh comment timestamps terse", () => {
    expect(formatCommentRelativeTime(new Date())).toBe("Just now")
  })
})
