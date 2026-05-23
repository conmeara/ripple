import { describe, expect, test } from "bun:test"
import {
  compactCommentLine,
  formatRevisionStatusLine,
  formatRevisionResultLine,
  formatCommentRelativeTime,
  formatCommentTimecode,
  parseRevisionDiffSummary,
  revisionStatusLabel,
} from "./comment-formatting"
import type {
  RippleRevisionStatus,
  RippleRevisionView,
} from "../../../shared/ripple-comments"

function revision(
  status: RippleRevisionStatus,
  overrides: Partial<RippleRevisionView> = {},
): RippleRevisionView {
  return {
    id: `${status}-revision`,
    threadId: "thread-1",
    projectId: "project-1",
    compositionId: "composition-1",
    conversationId: "conversation-1",
    chatId: null,
    subChatId: null,
    status,
    previewContextKey: null,
    diffSummary: null,
    errorMessage: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
    ...overrides,
  }
}

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

  test("maps running revision statuses to specific activity labels", () => {
    expect(revisionStatusLabel("queued")).toBe("Planning the change")
    expect(revisionStatusLabel("preparing")).toBe("Preparing the composition")
    expect(revisionStatusLabel("running")).toBe("Editing")
    expect(revisionStatusLabel("running")).not.toBe("Agent is working")
  })

  test("formats the card status line from live activity or fallback labels", () => {
    expect(formatRevisionStatusLine(revision("running"))).toBe("Editing")
    expect(formatRevisionStatusLine(revision("queued", {
      diffSummary: JSON.stringify({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        files: [],
        summary: "Agent is thinking",
      }),
    }))).toBe("Thinking")
    expect(formatRevisionStatusLine(revision("proposed", {
      diffSummary: JSON.stringify({
        fileCount: 1,
        additions: 4,
        deletions: 0,
        files: ["index.html"],
        summary: "Raised the phone in the center.",
      }),
    }))).toBe("Raised the phone in the center.")
    expect(formatRevisionStatusLine(revision("answered", {
      diffSummary: JSON.stringify({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        files: [],
        summary: "A purple fitness-app promo frame; no revision was needed.",
      }),
    }))).toBe("A purple fitness-app promo frame; no revision was needed.")
    expect(formatRevisionStatusLine(revision("answered"))).toBe("No changes needed")
  })

  test("sanitizes failed revision status lines before rendering comment cards", () => {
    expect(formatRevisionStatusLine(revision("failed", {
      errorMessage: "Bash failed in /Users/example/project/src/index.html with stderr output.",
    }))).toBe("Project check failed")
    expect(formatRevisionStatusLine(revision("failed", {
      errorMessage: "Claude Code usage limit reached.",
    }))).toBe("Agent usage limit reached")
    expect(formatRevisionStatusLine(revision("failed", {
      errorMessage: "Codex authentication required.",
    }))).toBe("Agent sign-in needed")
  })
})
