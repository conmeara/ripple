import { describe, expect, test } from "bun:test"
import {
  agentRuntimeSummaryPartFromEvent,
  agentRuntimePartStatus,
  agentRuntimeProviderRefsFromPart,
  agentRuntimeVisualToolKind,
  classifyAgentRuntimeSummaryPart,
  designerFacingAgentRuntimeLine,
  isUnsafeAgentRuntimeDefaultCopy,
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
      title: "Checked current frame",
    }))
    expect(agentRuntimeVisualToolKind(sheetPart)).toBe("frame_sheet")
    expect(summarizeAgentRuntimePart(sheetPart)).toEqual(expect.objectContaining({
      kind: "visual_context",
      status: "pending",
      title: "Checking frame sheet",
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

    expect(commandTitle).toBe("Checked changes")
    expect(editTitle).toBe("Updated composition")
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
      title: "Checking project",
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
    expect(titleForAgentRuntimeSummaryPart(statusPart)).toBe("Checking project")
    expect(titleForAgentRuntimeSummaryPart(commandStatusPart)).toBe("Checking project")
    expect(designerFacingAgentRuntimeLine("Looking up brand references")).toBe("Looking up brand references")
    expect(designerFacingAgentRuntimeLine("MCP provider stdout /Users/me/project"))
      .toBe("Working on project")
    expect(designerFacingAgentRuntimeLine("Codex session ready")).toBe("Working on project")
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

    expect(titleForAgentRuntimeDataPart(statusPart)).toBe("Checking project")
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
      title: "Updating composition",
    }))
    expect(fileChangePart && summarizeAgentRuntimePart(fileChangePart)).toEqual(expect.objectContaining({
      kind: "motion_edit",
      status: "done",
      title: "Updated composition",
    }))
  })
})
