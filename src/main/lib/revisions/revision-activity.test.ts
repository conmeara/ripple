import { describe, expect, test } from "bun:test"
import { extractRevisionRunActivityLine } from "./revision-activity"

describe("revision run activity", () => {
  test("summarizes runtime events as one-line comment progress", () => {
    expect(extractRevisionRunActivityLine([
      {
        type: "status",
        payload: { status: "running", label: "Codex session ready", sessionInit: {} },
      },
      { type: "reasoning", payload: { delta: "I need to inspect this." } },
    ])).toBe("Thinking")

    expect(extractRevisionRunActivityLine([
      { type: "reasoning", payload: { delta: "I need to inspect this." } },
      {
        type: "tool_start",
        providerType: "item/started",
        payload: { toolName: "Edit", command: "git diff -- index.html" },
      },
    ])).toBe("Updating composition")
  })

  test("does not expose raw tool commands as the activity line", () => {
    expect(extractRevisionRunActivityLine([
      {
        type: "tool_start",
        providerType: "item/started",
        payloadJson: JSON.stringify({
          toolName: "Bash",
          command: "git diff -- compositions/lower-third.html",
        }),
      },
    ])).toBe("Checking changes")

    expect(extractRevisionRunActivityLine([
      {
        type: "status",
        payload: {
          status: "running",
          label: "Bash /Users/example/project/src/index.html stdout={\"ok\":true}",
        },
      },
    ])).toBe("Checking project")
  })

  test("uses shared summaries for direct runtime events", () => {
    expect(extractRevisionRunActivityLine([
      {
        type: "file_change",
        payload: {
          path: "/Users/example/project/src/index.html",
          diff: "diff --git a/src/index.html b/src/index.html",
        },
      },
    ])).toBe("Updated composition")

    expect(extractRevisionRunActivityLine([
      {
        type: "approval_request",
        payload: {
          kind: "command",
          status: "pending",
          command: "Bash hyperframes lint /Users/example/project",
        },
      },
    ])).toBe("Approval needed")

    expect(extractRevisionRunActivityLine([
      {
        type: "tool_end",
        payload: {
          toolName: "Bash",
          command: "hyperframes lint",
          status: "failed",
          error: "Lint failed.",
        },
      },
    ])).toBe("Project check failed")
  })

  test("prefers normalized provider activity events with flexible labels", () => {
    expect(extractRevisionRunActivityLine([
      { type: "reasoning", payload: { delta: "checking the request" } },
      {
        type: "activity",
        payload: {
          kind: "searching",
          label: "Looking up brand references",
          source: "claude_agent_sdk",
        },
      },
    ])).toBe("Looking up brand references")

    expect(extractRevisionRunActivityLine([
      {
        type: "activity",
        payloadJson: JSON.stringify({
          kind: "checking",
          label: "bun test --filter comments",
        }),
      },
    ])).toBe("Checking project")
  })
})
