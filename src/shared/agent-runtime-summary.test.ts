import { describe, expect, test } from "bun:test"
import {
  agentRuntimePartStatus,
  agentRuntimeProviderRefsFromPart,
  agentRuntimeVisualToolKind,
  classifyAgentRuntimeSummaryPart,
  summarizeAgentRuntimePart,
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
})
