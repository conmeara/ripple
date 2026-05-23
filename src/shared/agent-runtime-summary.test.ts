import { describe, expect, test } from "bun:test"
import {
  agentRuntimeSummaryPartFromEvent,
  agentRuntimePartStatus,
  agentRuntimeProviderRefsFromPart,
  agentRuntimeVisualToolKind,
  classifyAgentRuntimeSummaryPart,
  designerFacingAgentRuntimeErrorLine,
  designerFacingAgentRuntimeLine,
  isAgentRuntimeMcpToolPart,
  isUnsafeAgentRuntimeDefaultCopy,
  latestAgentRuntimeActivityLine,
  summarizeAgentRuntimePart,
  shouldHideAgentRuntimeDataPart,
  titleForAgentRuntimeDataPart,
  titleForAgentRuntimeSummaryPart,
} from "./agent-runtime-summary"

describe("agent runtime product summaries", () => {
  test("translates visual tools into motion-designer language", () => {
    const snapshotPart = {
      type: "tool-mcp__ripple_visual_context__ripple_snapshot",
      toolCallId: "snapshot-1",
      toolName: "mcp__ripple_visual_context__ripple_snapshot",
      state: "output-available",
    }
    const sheetPart = {
      type: "tool-mcp__ripple_visual_context__ripple_frame_sheet",
      toolCallId: "sheet-1",
      toolName: "mcp__ripple_visual_context__ripple_frame_sheet",
      state: "input-available",
    }

    expect(agentRuntimeVisualToolKind(snapshotPart)).toBe("snapshot")
    expect(summarizeAgentRuntimePart(snapshotPart)).toEqual(expect.objectContaining({
      kind: "visual_context",
      status: "done",
      title: "Looked",
    }))
    expect(agentRuntimeVisualToolKind(sheetPart)).toBe("frame_sheet")
    expect(summarizeAgentRuntimePart(sheetPart)).toEqual(expect.objectContaining({
      kind: "visual_context",
      status: "pending",
      title: "Looking",
    }))
  })

  test("keeps raw tool and command names out of default summary titles", () => {
    const commandPart = {
      type: "tool-Bash",
      toolCallId: "cmd-1",
      input: { command: "git diff -- src/compositions/lower-third.html" },
      state: "output-available",
    }
    const editPart = {
      type: "tool-Edit",
      toolCallId: "edit-1",
      input: { file_path: "/Users/me/project/src/compositions/lower-third.html" },
      state: "output-available",
    }

    const commandTitle = titleForAgentRuntimeSummaryPart(commandPart)
    const editTitle = titleForAgentRuntimeSummaryPart(editPart)

    expect(commandTitle).toBe("Verified")
    expect(editTitle).toBe("Edited composition")
    expect(`${commandTitle} ${editTitle}`).not.toMatch(/Bash|Edit|\/Users|src\//)
  })

  test("classifies search, edit, approval, and assistant parts without provider coupling", () => {
    expect(classifyAgentRuntimeSummaryPart({
      type: "tool-Read",
      input: { file_path: "index.html" },
    })).toBe("project_inspection")
    expect(classifyAgentRuntimeSummaryPart({
      type: "tool-Write",
      input: { file_path: "index.html" },
    })).toBe("motion_edit")
    expect(classifyAgentRuntimeSummaryPart({
      type: "data-agent-runtime",
      data: { kind: "approval", label: "Approval needed" },
    })).toBe("approval")
    expect(classifyAgentRuntimeSummaryPart({
      type: "text",
      text: "Done.",
    })).toBe("assistant_text")
  })

  test("recognizes generic MCP tools without exposing their server names as product copy", () => {
    const part = {
      type: "tool-mcp__asset_library__search_media",
      toolName: "mcp__asset_library__search_media",
      state: "input-available",
    }

    expect(isAgentRuntimeMcpToolPart(part)).toBe(true)
    expect(summarizeAgentRuntimePart(part)).toEqual(expect.objectContaining({
      kind: "project_activity",
      status: "pending",
      title: "Working on project",
    }))
  })

  test("summarizes unknown tools without exposing raw tool names", () => {
    const pendingTitle = titleForAgentRuntimeSummaryPart({
      type: "tool-provider_internal_renderPreview",
      state: "input-available",
    })
    const doneTitle = titleForAgentRuntimeSummaryPart({
      type: "tool-provider_internal_renderPreview",
      state: "output-available",
    })

    expect(pendingTitle).toBe("Working on project")
    expect(doneTitle).toBe("Worked on project")
    expect(`${pendingTitle} ${doneTitle}`).not.toMatch(/provider_internal|renderPreview|tool-/)
  })

  test("preserves provider refs for debug and replay while summarizing default copy", () => {
    const part = {
      type: "tool-Bash",
      toolCallId: "cmd-1",
      input: { command: "bun test src/renderer/features/agents/ui" },
      state: "input-available",
      providerRefs: [{
        eventId: "event-1",
        provider: "codex",
        runId: "run-1",
        rawProviderMethod: "item/started",
        rawPayload: { command: "bun test src/renderer/features/agents/ui" },
      }],
    }

    expect(agentRuntimePartStatus(part)).toBe("pending")
    expect(agentRuntimeProviderRefsFromPart(part)).toEqual([
      expect.objectContaining({
        eventId: "event-1",
        rawProviderMethod: "item/started",
      }),
    ])
    expect(summarizeAgentRuntimePart(part)).toEqual(expect.objectContaining({
      kind: "verification",
      title: "Verifying",
      providerRefs: [
        expect.objectContaining({ eventId: "event-1" }),
      ],
    }))
  })

  test("masks technical status labels in default runtime copy", () => {
    const statusPart = {
      type: "data-agent-runtime",
      data: {
        kind: "status",
        label: "Bash /Users/me/project/src/index.html stdout={\"ok\":true}",
      },
    }
    const commandStatusPart = {
      type: "data-agent-runtime",
      data: {
        kind: "status",
        label: "git diff -- src/compositions/lower-third.html",
      },
    }

    expect(isUnsafeAgentRuntimeDefaultCopy(statusPart.data.label)).toBe(true)
    expect(titleForAgentRuntimeSummaryPart(statusPart)).toBe("Verifying")
    expect(titleForAgentRuntimeSummaryPart(commandStatusPart)).toBe("Verifying")
    expect(designerFacingAgentRuntimeLine("Looking up brand references")).toBe("Looking up brand references")
    expect(designerFacingAgentRuntimeLine("MCP provider stdout /Users/me/project"))
      .toBe("Working on project")
    expect(designerFacingAgentRuntimeLine("Codex session ready")).toBe("Working on project")
  })

  test("uses failure-specific copy instead of progress fallbacks for errors", () => {
    expect(designerFacingAgentRuntimeErrorLine("Claude Code usage limit reached."))
      .toBe("Agent usage limit reached")
    expect(designerFacingAgentRuntimeErrorLine("Codex authentication required."))
      .toBe("Agent sign-in needed")
    expect(designerFacingAgentRuntimeErrorLine(
      "Bash failed in /Users/example/project/src/index.html with stderr output.",
    )).toBe("Project check failed")
    expect(designerFacingAgentRuntimeErrorLine("Provider payload: {\"error\":true}"))
      .toBe("Agent needs attention")
  })

  test("uses shared data-part titles for legacy renderer fallbacks", () => {
    const statusPart = {
      type: "data-agent-runtime",
      data: {
        kind: "status",
        label: "Bash /Users/me/project/src/index.html stdout={\"ok\":true}",
      },
    }
    const capabilityPart = {
      type: "data-agent-runtime",
      data: {
        kind: "status",
        label: "Loaded Codex context: 1 MCP server",
        payload: {
          label: "Loaded Codex context: 1 MCP server",
          sessionInit: { tools: ["Bash"] },
        },
      },
    }

    expect(titleForAgentRuntimeDataPart(statusPart)).toBe("Verifying")
    expect(shouldHideAgentRuntimeDataPart(capabilityPart)).toBe(true)
    expect(titleForAgentRuntimeDataPart(capabilityPart)).toBeNull()
  })

  test("derives shared summary parts from persisted runtime events", () => {
    const editPart = agentRuntimeSummaryPartFromEvent({
      type: "tool_start",
      payload: {
        toolName: "Edit",
        input: { file_path: "/Users/me/project/src/index.html" },
      },
    })
    const fileChangePart = agentRuntimeSummaryPartFromEvent({
      type: "file_change",
      payload: {
        path: "/Users/me/project/src/index.html",
        diff: "diff --git a/src/index.html b/src/index.html",
      },
    })

    expect(editPart && summarizeAgentRuntimePart(editPart)).toEqual(expect.objectContaining({
      kind: "motion_edit",
      status: "pending",
      title: "Editing",
    }))
    expect(fileChangePart && summarizeAgentRuntimePart(fileChangePart)).toEqual(expect.objectContaining({
      kind: "motion_edit",
      status: "done",
      title: "Edited composition",
    }))
  })

  test("derives failed tool completions as needs-attention activity", () => {
    const failedCheckPart = agentRuntimeSummaryPartFromEvent({
      type: "tool_end",
      payload: {
        toolName: "Bash",
        command: "hyperframes lint",
        status: "failed",
        error: "Lint failed.",
      },
    })

    expect(failedCheckPart && summarizeAgentRuntimePart(failedCheckPart))
      .toEqual(expect.objectContaining({
        kind: "verification",
        status: "error",
        title: "Project check failed",
      }))
    expect(latestAgentRuntimeActivityLine([
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

  test("derives the latest shared activity line from persisted events", () => {
    expect(latestAgentRuntimeActivityLine([
      {
        type: "status",
        payload: { status: "running", label: "Codex session ready" },
      },
      { type: "reasoning", payload: { delta: "I need to inspect this." } },
    ])).toBe("Thinking")

    expect(latestAgentRuntimeActivityLine([
      { type: "reasoning", payload: { delta: "I need to inspect this." } },
      {
        type: "tool_start",
        providerType: "item/started",
        payload: { toolName: "Edit", command: "git diff -- index.html" },
      },
    ])).toBe("Editing")

    expect(latestAgentRuntimeActivityLine([
      {
        type: "tool_start",
        providerType: "mcpToolCall",
        payload: { server: "asset_library", tool: "search_media" },
      },
    ])).toBe("Working on project")

    expect(latestAgentRuntimeActivityLine([
      { type: "assistant_text_delta", payload: { delta: "Done." } },
    ])).toBe("Thinking")
  })

  test("keeps unsafe latest activity copy out of comment/status lines", () => {
    expect(latestAgentRuntimeActivityLine([
      {
        type: "activity",
        payload: {
          kind: "checking",
          label: "Bash /Users/example/project/src/index.html stdout={\"ok\":true}",
        },
      },
    ])).toBe("Verifying")

    expect(latestAgentRuntimeActivityLine([
      {
        type: "activity",
        payload: {
          kind: "searching",
          label: "Looking up brand references",
          source: "claude_agent_sdk",
        },
      },
    ])).toBe("Looking up brand references")

    expect(latestAgentRuntimeActivityLine([
      {
        type: "status",
        payload: {
          status: "running",
          message: "git diff -- src/index.html",
        },
      },
    ])).toBe("Verifying")

    expect(latestAgentRuntimeActivityLine([
      { type: "reasoning", payload: { delta: "Inspect the request." } },
      {
        type: "status",
        payload: {
          label: "Loaded Codex context: 1 MCP server",
          sessionInit: { tools: ["Bash"] },
        },
      },
    ])).toBe("Thinking")
  })
})
