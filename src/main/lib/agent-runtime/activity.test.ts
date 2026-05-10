import { describe, expect, test } from "bun:test"
import {
  buildAgentRunActivityEvent,
  buildProviderSummaryActivityEvent,
  classifyAgentRunActivity,
  normalizeAgentRunActivityPayload,
} from "./activity"

describe("agent runtime activity normalization", () => {
  test("keeps a stable kind with a flexible safe one-line label", () => {
    expect(normalizeAgentRunActivityPayload({
      kind: "searching",
      label: "Looking up brand references",
      source: "claude_agent_sdk",
    })).toEqual({
      kind: "searching",
      label: "Looking up brand references",
      source: "claude_agent_sdk",
    })

    expect(normalizeAgentRunActivityPayload({
      kind: "checking",
      label: "git diff -- docs/specs/Comments.html",
    })).toEqual({
      kind: "checking",
      label: "Checking the project",
    })
  })

  test("classifies Codex App Server tool signals without leaking commands", () => {
    expect(buildAgentRunActivityEvent({
      eventType: "tool_start",
      providerType: "item/started",
      providerId: "cmd-1",
      payload: {
        toolName: "Bash",
        command: "bun test",
      },
      source: "codex_app_server",
    })).toEqual({
      type: "activity",
      providerType: "item/started",
      providerId: "cmd-1",
      payload: {
        kind: "checking",
        label: "Checking the project",
        source: "codex_app_server",
      },
    })

    expect(classifyAgentRunActivity({
      eventType: "file_change",
      providerType: "turn/diff/updated",
      payload: { diff: "diff --git a/index.html b/index.html" },
    })).toBe("editing")
  })

  test("classifies Claude Agent SDK open-ended activity signals", () => {
    expect(buildAgentRunActivityEvent({
      eventType: "tool_update",
      providerType: "content_block_delta",
      providerId: "tool-1",
      payload: {
        toolName: "Read",
        inputTextDelta: "{\"file_path\":\"/tmp/project/AGENTS.md\"}",
      },
      source: "claude_agent_sdk",
    }).payload).toEqual({
      kind: "reading",
      label: "Reading context",
      source: "claude_agent_sdk",
    })

    expect(buildAgentRunActivityEvent({
      eventType: "file_change",
      providerType: "system:files_persisted",
      providerId: "msg-1",
      payload: { files: ["index.html"] },
      source: "claude_agent_sdk",
    }).payload).toEqual({
      kind: "editing",
      label: "Editing files",
      source: "claude_agent_sdk",
    })

    expect(classifyAgentRunActivity({
      eventType: "tool_start",
      providerType: "assistant:tool_use",
      payload: { toolName: "WebFetch" },
    })).toBe("searching")

    expect(classifyAgentRunActivity({
      eventType: "tool_start",
      providerType: "assistant:tool_use",
      payload: { toolName: "TodoWrite" },
    })).toBe("thinking")
  })

  test("accepts provider summary labels when they are safe", () => {
    expect(buildProviderSummaryActivityEvent({
      providerType: "tool_use_summary",
      providerId: "summary-1",
      summary: "Reading project instructions",
      source: "claude_agent_sdk",
    })).toEqual({
      type: "activity",
      providerType: "tool_use_summary",
      providerId: "summary-1",
      payload: {
        kind: "reading",
        label: "Reading project instructions",
        source: "claude_agent_sdk",
      },
    })
  })
})
