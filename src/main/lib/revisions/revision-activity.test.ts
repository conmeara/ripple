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
