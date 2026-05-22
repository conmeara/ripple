import { describe, expect, test } from "bun:test"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../../../../shared/agent-runtime-ui-projection"
import {
  normalizeCodexAppServerNotification,
  type JsonRpcMessage,
} from "../../../../main/lib/agent-runtime/providers/codex-app-server-events"
import {
  activeMotionRuntimeItemId,
  buildMotionRuntimeActivity,
  buildMotionRuntimeCanonicalEvents,
  buildMotionRuntimeTimeline,
  displayThoughtText,
  hasMotionRuntimeActivityParts,
  shouldHideMotionRuntimeInterimPart,
  shouldShowMotionRuntimeThinkingFallback,
  type MotionRuntimeCanonicalEvent,
  visualToolKind,
} from "./motion-runtime-activity"

const ONE_BY_ONE_PNG = "iVBORw0KGgo="

function runtimeRowsFromParts(parts: Record<string, any>[]) {
  return buildMotionRuntimeTimeline({ parts }).flatMap((entry) =>
    entry.kind === "runtime"
      ? buildMotionRuntimeActivity({ events: entry.events }).items
      : []
  )
}

function codexEventsFromMessages(messages: JsonRpcMessage[]): RuntimeEventLike[] {
  return messages.flatMap((message, messageIndex) =>
    normalizeCodexAppServerNotification(message).map((event, eventIndex) => ({
      ...event,
      id: `codex-event-${messageIndex}-${eventIndex}`,
      agentRunId: "run-codex",
      sequence: messageIndex * 10 + eventIndex + 1,
      createdAt: `2026-05-21T12:00:${String(messageIndex).padStart(2, "0")}.000Z`,
      provider: "codex",
      payload: {
        ...(event.payload ?? {}),
        providerRefs: event.refs,
      },
    }))
  )
}

describe("motion runtime activity projection", () => {
  test("projects a Codex app-server run into motion-editor rows with provider provenance", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Done.",
      events: codexEventsFromMessages([
        {
          method: "turn/started",
          params: { turn: { id: "turn-1" } },
        },
        {
          method: "item/reasoning/summaryTextDelta",
          params: {
            itemId: "reason-1",
            turnId: "turn-1",
            summaryIndex: 0,
            delta: "Planning the title animation",
          },
        },
        {
          method: "item/reasoning/textDelta",
          params: {
            itemId: "reason-1",
            turnId: "turn-1",
            contentIndex: 0,
            delta: "I'll inspect intro.html, then adjust the title timing.",
          },
        },
        {
          method: "item/started",
          params: {
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "read-1",
              command: "sed -n '1,80p' intro.html",
              cwd: "/Users/me/project",
              status: "inProgress",
            },
          },
        },
        {
          method: "item/completed",
          params: {
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "read-1",
              command: "sed -n '1,80p' intro.html",
              cwd: "/Users/me/project",
              status: "completed",
              aggregatedOutput: "<h1>Ripple</h1>",
              exitCode: 0,
            },
          },
        },
        {
          method: "item/started",
          params: {
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "edit-1",
              status: "inProgress",
              changes: [{
                path: "intro.html",
                kind: { type: "update" },
                diff: "-top: 295px;\n+top: 215px;",
              }],
            },
          },
        },
        {
          method: "item/completed",
          params: {
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "edit-1",
              status: "completed",
              changes: [{
                path: "intro.html",
                kind: { type: "update" },
                diff: "-top: 295px;\n+top: 215px;",
              }],
            },
          },
        },
        {
          method: "item/completed",
          params: {
            turnId: "turn-1",
            item: {
              type: "agentMessage",
              id: "msg-1",
              text: "Moved the title timing into place.",
            },
          },
        },
      ]),
    })
    const rows = runtimeRowsFromParts(projection.parts)

    expect(rows.map((row) => [row.kind, row.title, row.status])).toEqual([
      ["explored", "Explored 1 file", "done"],
      ["motion_change", "Updated composition", "done"],
    ])
    expect(rows.some((row) => /Bash|Edit/.test(row.title))).toBe(false)
    const reasoningPart = projection.parts.find((part) => part.type === "reasoning")
    expect(reasoningPart?.providerRefs?.[0]).toEqual(expect.objectContaining({
      provider: "codex",
      runId: "run-codex",
      turnId: "turn-1",
      rawProviderMethod: "item/reasoning/summaryTextDelta",
    }))
  })

  test("projects a Claude SDK stream into the same motion-editor activity grammar", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Done.",
      events: [
        {
          id: "claude-thinking-start",
          agentRunId: "run-claude",
          sequence: 1,
          provider: "claude",
          type: "activity",
          providerType: "content_block_start",
          providerId: "thinking-1",
          payload: {
            kind: "thinking",
            label: "Agent is thinking",
          },
        },
        {
          id: "claude-thinking-delta",
          agentRunId: "run-claude",
          sequence: 2,
          provider: "claude",
          type: "reasoning",
          providerType: "content_block_delta",
          providerId: "thinking-1",
          payload: {
            delta: "**Checking frame balance** I need to inspect the title card before editing.",
          },
        },
        {
          id: "claude-read-start",
          agentRunId: "run-claude",
          sequence: 3,
          provider: "claude",
          type: "tool_start",
          providerType: "assistant:tool_use",
          providerId: "read-1",
          payload: {
            toolCallId: "read-1",
            toolName: "Read",
            input: { file_path: "intro.html" },
          },
        },
        {
          id: "claude-read-end",
          agentRunId: "run-claude",
          sequence: 4,
          provider: "claude",
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "read-1",
          payload: {
            toolCallId: "read-1",
            toolName: "Read",
            output: "<h1>Ripple</h1>",
            status: "completed",
          },
        },
        {
          id: "claude-edit-start",
          agentRunId: "run-claude",
          sequence: 5,
          provider: "claude",
          type: "tool_start",
          providerType: "assistant:tool_use",
          providerId: "edit-1",
          payload: {
            toolCallId: "edit-1",
            toolName: "Edit",
            input: {
              file_path: "intro.html",
              old_string: "top: 295px;",
              new_string: "top: 215px;",
            },
          },
        },
        {
          id: "claude-edit-end",
          agentRunId: "run-claude",
          sequence: 6,
          provider: "claude",
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "edit-1",
          payload: {
            toolCallId: "edit-1",
            toolName: "Edit",
            output: "File updated.",
            status: "completed",
          },
        },
        {
          id: "claude-message",
          agentRunId: "run-claude",
          sequence: 7,
          provider: "claude",
          type: "assistant_message",
          providerType: "assistant",
          providerId: "msg-1",
          payload: { text: "Adjusted the title card." },
        },
      ],
    })
    const rows = runtimeRowsFromParts(projection.parts)

    expect(rows.map((row) => [row.kind, row.title, row.status])).toEqual([
      ["explored", "Explored 1 file", "done"],
      ["motion_change", "Updated composition", "done"],
    ])
    const reasoningPart = projection.parts.find((part) => part.type === "reasoning")
    expect(reasoningPart?.providerRefs?.[0]).toEqual(expect.objectContaining({
      provider: "claude",
      runId: "run-claude",
      rawProviderMethod: "content_block_delta",
    }))
  })

  test("normalizes UI parts into canonical runtime events before summarizing", () => {
    const events = buildMotionRuntimeCanonicalEvents({
      parts: [
        {
          type: "reasoning",
          id: "reason-1",
          text: "Need to inspect the title animation.",
          state: "done",
        },
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "intro.html" },
          state: "output-available",
        },
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/snap_1/current.png",
          },
          state: "output-available",
        },
      ],
    })

    expect(events.map((event) => [event.type, event.itemType, event.streamKind])).toEqual([
      ["content.delta", "reasoning", "reasoning_text"],
      ["item.completed", "project_inspection", "tool_output"],
      ["item.completed", "visual_context", "tool_output"],
    ])

    expect(buildMotionRuntimeActivity({ events }).items.map((item) => item.title)).toEqual([
      "Explored 1 file",
      "Checked current frame",
    ])
  })

  test("preserves provider refs on canonical runtime events", () => {
    const events = buildMotionRuntimeCanonicalEvents({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "cmd-1",
          input: { command: "bun test" },
          state: "input-available",
          providerRefs: [{
            eventId: "event-1",
            createdAt: "2026-05-21T12:00:00.000Z",
            provider: "codex",
            requestId: "request-1",
            turnId: "turn-1",
            itemId: "cmd-1",
            rawProviderMethod: "item/started",
            rawPayload: { itemId: "cmd-1" },
          }],
        },
      ],
    })

    expect(events[0]).toEqual(expect.objectContaining({
      id: "event-1",
      eventId: "event-1",
      createdAt: "2026-05-21T12:00:00.000Z",
      provider: "codex",
      requestId: "request-1",
      turnId: "turn-1",
      itemId: "cmd-1",
      providerRefs: [
        expect.objectContaining({
          rawProviderMethod: "item/started",
          rawPayload: { itemId: "cmd-1" },
        }),
      ],
    }))
  })

  test("summarizes provider-style canonical events without UI-shaped parts", () => {
    const events: MotionRuntimeCanonicalEvent[] = [
      {
        id: "reason:event",
        type: "content.delta",
        index: 0,
        itemId: "reason-1",
        itemType: "reasoning",
        streamKind: "reasoning_text",
        status: "done",
        text: "Compare the current frame against the brief.",
      },
      {
        id: "read:event",
        type: "item.completed",
        index: 1,
        itemId: "read-1",
        itemType: "project_inspection",
        toolType: "tool-Read",
        toolName: "Read",
        status: "done",
        input: { file_path: "intro.html" },
      },
      {
        id: "snap:event",
        type: "item.completed",
        index: 2,
        itemId: "snap-1",
        itemType: "visual_context",
        visualKind: "snapshot",
        status: "done",
        output: {
          artifactPath: ".ripple/visual-context/snapshots/current.png",
        },
      },
    ]

    const projection = buildMotionRuntimeActivity({
      projectPath: "/Users/me/project",
      events,
    })

    expect(projection.items.map((item) => item.title)).toEqual([
      "Explored 1 file",
      "Checked current frame",
    ])
    expect(projection.items[1]?.visual?.imageUrl).toBe(
      "file:///Users/me/project/.ripple/visual-context/snapshots/current.png",
    )
  })

  test("maps technical agent parts into motion-editor activity", () => {
    const projection = buildMotionRuntimeActivity({
      projectPath: "/Users/me/project",
      metadata: {
        model: "gpt-5.5",
        inputTokens: 1200,
        outputTokens: 400,
        durationMs: 3200,
      },
      parts: [
        {
          type: "reasoning",
          id: "reason-1",
          text: "Need to inspect the title animation.",
          state: "done",
        },
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "intro.html" },
          state: "output-available",
        },
        {
          type: "tool-Grep",
          toolCallId: "grep-1",
          input: { pattern: "fadeIn" },
          state: "output-available",
        },
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/snap_1/current.png",
            type: "snapshot",
            payload: {
              snapshot: {
                path: ".ripple/visual-context/snapshots/snap_1/current.png",
              },
            },
          },
          state: "output-available",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "intro.html" },
          output: { status: "completed" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "cmd-1",
          input: { command: "hyperframes lint" },
          output: { exitCode: 0, stdout: "No issues found" },
          state: "output-available",
        },
      ],
    })

    expect(projection.items.map((item) => item.title)).toEqual([
      "Explored 1 file, 1 search",
      "Checked current frame",
      "Updated composition",
      "Checked project",
    ])
    expect(projection.items[1]?.visual?.imageUrl).toBe(
      "file:///Users/me/project/.ripple/visual-context/snapshots/snap_1/current.png",
    )
    expect(projection.items[1]?.subtitle).toBe("")
    expect(projection.items.some((item) => item.title.includes("Bash"))).toBe(false)
    expect(projection.items.some((item) => item.title.includes("Token"))).toBe(false)
    expect(projection.advancedDetails.some((detail) => detail.label === "Command")).toBe(true)
    expect(projection.advancedDetails.some((detail) => detail.label === "Usage")).toBe(true)
    expect(projection.advancedDetails.some((detail) => detail.label === "Thinking")).toBe(false)
  })

  test("drops completed Claude-style thinking once visible activity follows", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "data-agent-runtime",
          id: "status-thinking",
          data: {
            kind: "status",
            label: "Thinking",
          },
        },
        {
          type: "tool-Thinking",
          toolCallId: "claude-thinking-1",
          input: {
            text: "**Evaluating file editing** I need to inspect the animation source before changing anything.",
          },
          state: "output-available",
        },
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "index.html" },
          state: "output-available",
        },
      ],
    })

    expect(projection.items.map((item) => item.title)).toEqual([
      "Explored 1 file",
    ])
    expect(projection.advancedDetails.some((detail) => detail.label === "Thinking")).toBe(false)
  })

  test("keeps the thinking headline clean while revealing full reasoning on demand", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Thinking",
          toolCallId: "claude-thinking-1",
          input: {
            text: "**Finalizing output details** I need to include lint warnings, memory citations, and an absolute path for index.html.",
          },
          state: "output-available",
        },
      ],
    })

    expect(projection.items).toHaveLength(1)
    expect(projection.items[0]).toEqual(expect.objectContaining({
      kind: "thinking",
      title: "Thinking",
      preview: "Finalizing output details",
    }))
    // The glanceable headline stays clean — no code jargon.
    expect(projection.items[0]?.preview).not.toContain("memory citations")
    expect(projection.items[0]?.preview).not.toContain("index.html")
    // …but the full reasoning is available on demand in the expandable detail.
    expect(projection.items[0]?.details?.[0]?.value).toContain("memory citations")
    expect(projection.items[0]?.details?.[0]?.value).toContain("index.html")
  })

  test("uses the Codex reasoning summary as the headline and full text as detail", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "reasoning",
          id: "reason-codex",
          summary: "Planning the title animation",
          text: "I'll inspect intro.html, then adjust the fadeIn keyframes in styles.css.",
          state: "output-available",
        },
      ],
    })

    expect(projection.items).toHaveLength(1)
    expect(projection.items[0]).toEqual(expect.objectContaining({
      kind: "thinking",
      title: "Thinking",
      preview: "Planning the title animation",
    }))
    expect(projection.items[0]?.details?.[0]?.value).toBe(
      "I'll inspect intro.html, then adjust the fadeIn keyframes in styles.css.",
    )
  })

  test("translates technical reasoning headlines into motion project language", () => {
    expect(displayThoughtText("**Validating hyperframes**")).toBe("Checking project")
    expect(displayThoughtText("**Inspecting hyperframes commands**")).toBe("Checking project tools")
    expect(displayThoughtText("**Inspecting CSS/JS Positions**")).toBe("Adjusting composition")
  })

  test("coalesces consecutive Claude thinking chunks into one umbrella", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Thinking",
          toolCallId: "claude-thinking-1",
          input: { text: "Inspect the frame first." },
          state: "output-available",
        },
        {
          type: "tool-Thinking",
          toolCallId: "claude-thinking-2",
          input: { text: "No file edit is needed." },
          state: "output-available",
        },
      ],
    })

    expect(projection.items).toHaveLength(1)
    expect(projection.items[0]).toEqual(expect.objectContaining({
      kind: "thinking",
      title: "Thinking",
      preview: "Inspect the frame first. No file edit is needed.",
    }))
    expect(projection.items[0]?.details?.[0]?.value).toContain("Inspect the frame first.")
    expect(projection.items[0]?.details?.[0]?.value).toContain("No file edit is needed.")
    expect(projection.advancedDetails).toHaveLength(0)
  })

  test("uses lightweight thinking status when no model reasoning is available", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "data-agent-runtime",
          id: "status-thinking",
          data: {
            kind: "status",
            label: "Thinking",
          },
        },
      ],
    })

    expect(projection.items).toEqual([
      expect.objectContaining({
        kind: "thinking",
        title: "Thinking",
        subtitle: "",
      }),
    ])
    expect(projection.items[0]?.details).toBeUndefined()
  })

  test("keeps active reasoning visibly live while preserving the thought preview", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "reasoning",
          id: "reason-live",
          text: "Checking the current frame before changing the timing.",
          state: "streaming",
          startedAt: 1_777_777_000_000,
        },
      ],
    })

    expect(projection.items).toEqual([
      expect.objectContaining({
        kind: "thinking",
        title: "Thinking",
        status: "pending",
        preview: "Checking the current frame before changing the timing.",
        liveTitle: "Checking the current frame before changing the timing.",
        defaultExpanded: false,
        startedAt: 1_777_777_000_000,
      }),
    ])
    expect(projection.items[0]?.details?.[0]).toEqual(expect.objectContaining({
      label: "Thought",
      value: "Checking the current frame before changing the timing.",
    }))
  })

  test("keeps lightweight thinking status pending while the run is active", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "data-agent-runtime",
          id: "status-thinking",
          state: "streaming",
          data: {
            kind: "status",
            label: "Thinking",
          },
        },
      ],
    })

    expect(projection.items).toEqual([
      expect.objectContaining({
        kind: "thinking",
        title: "Thinking",
        status: "pending",
      }),
    ])
  })

  test("drops stale lightweight thinking once visible activity follows", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "data-agent-runtime",
          id: "status-thinking",
          state: "streaming",
          data: {
            kind: "status",
            label: "Thinking",
          },
        },
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
      ],
    })

    expect(projection.items.map((item) => [item.kind, item.title, item.status])).toEqual([
      ["visual_check", "Checked current frame", "done"],
    ])
  })

  test("does not add a live fallback when a thinking row is actively pending", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "reasoning",
          id: "reason-live",
          text: "Inspecting the motion.",
          state: "streaming",
        },
      ],
    })

    expect(shouldShowMotionRuntimeThinkingFallback({
      timeline,
      sandboxSetupStatus: "ready",
      isStreaming: true,
      isLastMessage: true,
    })).toBe(false)
  })

  test("adds a live fallback after completed thinking and settled work", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "reasoning",
          id: "reason-done",
          text: "The previous check is complete.",
          state: "done",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          output: { status: "completed" },
          state: "output-available",
        },
      ],
    })

    expect(shouldShowMotionRuntimeThinkingFallback({
      timeline,
      sandboxSetupStatus: "ready",
      isStreaming: true,
      isLastMessage: true,
    })).toBe(true)
  })

  test("adds one live fallback when settled runtime work has no current item", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
      ],
    })

    expect(shouldShowMotionRuntimeThinkingFallback({
      timeline,
      sandboxSetupStatus: "ready",
      isStreaming: true,
      isLastMessage: true,
    })).toBe(true)
  })

  test("adds a live fallback after earlier narration and settled work", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
        {
          type: "text",
          id: "text-1",
          text: "I can see the title is too low.",
          state: "done",
        },
        {
          type: "tool-Bash",
          toolCallId: "read-1",
          input: { command: "sed -n '1,80p' index.html" },
          output: { exitCode: 0, stdout: "<h1>Title</h1>" },
          state: "output-available",
        },
      ],
    })

    expect(shouldShowMotionRuntimeThinkingFallback({
      timeline,
      sandboxSetupStatus: "ready",
      isStreaming: true,
      isLastMessage: true,
    })).toBe(true)
  })

  test("does not add a fallback while visible assistant text is streaming", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
        {
          type: "text",
          id: "text-1",
          text: "I can see the title is too low.",
          state: "streaming",
        },
      ],
    })

    expect(shouldShowMotionRuntimeThinkingFallback({
      timeline,
      sandboxSetupStatus: "ready",
      isStreaming: true,
      isLastMessage: true,
    })).toBe(false)
  })

  test("only marks a genuinely pending runtime item as live", () => {
    const settledRows = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
      ],
    }).items

    const activeRows = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "intro.html" },
          state: "input-available",
        },
      ],
    }).items

    expect(activeMotionRuntimeItemId(settledRows, true)).toBeUndefined()
    expect(activeMotionRuntimeItemId(activeRows, true)).toBe(activeRows[1]?.id)
    expect(activeMotionRuntimeItemId(activeRows, false)).toBeUndefined()
  })

  test("keeps Claude native visual images available when the tool returns image content", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_frame_sheet",
          toolCallId: "sheet-1",
          toolName: "mcp__ripple_visual_context__ripple_frame_sheet",
          output: [
            {
              type: "text",
              text: [
                "Ripple visual context is attached as a native image.",
                JSON.stringify({
                  ok: true,
                  type: "sheet",
                  artifact: {
                    path: ".ripple/frame-sheets/sheet_1/sheet.png",
                  },
                }),
              ].join("\n"),
            },
            {
              type: "image",
              data: ONE_BY_ONE_PNG,
              mimeType: "image/png",
            },
          ],
          state: "output-available",
        },
      ],
    })

    expect(projection.items).toHaveLength(1)
    expect(projection.items[0]?.title).toBe("Checked frame sheet")
    expect(projection.items[0]?.visual).toEqual(expect.objectContaining({
      kind: "frame_sheet",
      imageUrl: `data:image/png;base64,${ONE_BY_ONE_PNG}`,
    }))
  })

  test("keeps project-owned visual artifact paths loadable for the renderer", () => {
    const projection = buildMotionRuntimeActivity({
      projectPath: "/Users/me/project",
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: "/Users/me/project/.ripple/visual-context/current frame.png",
          },
          state: "output-available",
        },
      ],
    })

    expect(projection.items[0]?.visual?.imageUrl).toBe(
      "file:///Users/me/project/.ripple/visual-context/current%20frame.png",
    )
  })

  test("rejects visual artifact paths outside the project-owned preview folder", () => {
    for (const artifactPath of [
      "/private/tmp/ripple/current.png",
      "file:///Users/me/secret.png",
      "../secret.png",
      "assets/current.png",
      ".ripple/../secret.png",
    ]) {
      const projection = buildMotionRuntimeActivity({
        projectPath: "/Users/me/project",
        parts: [
          {
            type: "tool-mcp__ripple_visual_context__ripple_snapshot",
            toolName: "mcp__ripple_visual_context__ripple_snapshot",
            output: { artifactPath },
            state: "output-available",
          },
        ],
      })

      expect(projection.items[0]?.visual?.imageUrl).toBeUndefined()
    }
  })

  test("recognizes visual tools across native MCP and reversible shell fallbacks", () => {
    expect(visualToolKind({
      type: "tool-mcp__ripple_visual_context__ripple_snapshot",
      toolName: "mcp__ripple_visual_context__ripple_snapshot",
    })).toBe("snapshot")
    expect(visualToolKind({
      type: "tool-snapshot",
      toolName: "snapshot",
    })).toBe("snapshot")
    expect(visualToolKind({
      type: "tool-Bash",
      input: { command: "ripple frame-sheet --range 0s..1s --json" },
    })).toBe("frame_sheet")
  })

  test("identifies runtime activity without treating approvals as hidden technical work", () => {
    expect(hasMotionRuntimeActivityParts([
      {
        type: "data-agent-runtime",
        data: {
          kind: "approval",
          label: "Approval needed",
        },
      },
    ])).toBe(false)

    expect(hasMotionRuntimeActivityParts([
      {
        type: "tool-Bash",
        input: { command: "hyperframes lint" },
      },
    ])).toBe(true)
  })

  test("preserves text position between runtime chunks", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          output: { artifactPath: ".ripple/current.png" },
        },
        {
          type: "text",
          id: "text-1",
          text: "I can see the phones are low in frame.",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          output: { status: "completed" },
        },
        {
          type: "text",
          id: "text-2",
          text: "Moved them up.",
        },
      ],
    })

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "runtime",
      "part",
      "runtime",
      "part",
    ])
    expect(timeline[1]).toEqual(expect.objectContaining({
      kind: "part",
      index: 1,
    }))
    expect(timeline[0]).toEqual(expect.objectContaining({
      kind: "runtime",
      events: [
        expect.objectContaining({
          itemType: "visual_context",
          type: "item.completed",
        }),
      ],
    }))
    expect(timeline[3]).toEqual(expect.objectContaining({
      kind: "part",
      index: 3,
    }))
  })

  test("keeps assistant text visible before later runtime activity", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          output: { artifactPath: ".ripple/current.png" },
        },
        {
          type: "reasoning",
          id: "reasoning-1",
          state: "done",
          text: "I can see the phone is centered and should check the source.",
        },
        {
          type: "text",
          id: "text-1",
          text: "I can see the phone is centered. Let me check the source.",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          output: { status: "completed" },
        },
        {
          type: "text",
          id: "text-2",
          text: "Moved the phone left.",
        },
      ],
    })

    expect(timeline.map((entry, index) =>
      shouldHideMotionRuntimeInterimPart({ entry, timeline, index })
    )).toEqual([false, false, false, false])
    const runtimeItems = timeline.flatMap((entry) =>
      entry.kind === "runtime"
        ? buildMotionRuntimeActivity({ parts: entry.parts, events: entry.events }).items
        : []
    )
    expect(runtimeItems.map((item) => item.kind)).toEqual([
      "visual_check",
      "motion_change",
    ])
  })

  test("only keeps the newest unresolved timeline activity pending", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "first-check",
          input: { command: "hyperframes lint ." },
          state: "input-available",
        },
        {
          type: "text",
          id: "text-1",
          text: "Still checking.",
        },
        {
          type: "tool-Bash",
          toolCallId: "latest-check",
          input: { command: "hyperframes render ." },
          state: "input-available",
        },
      ],
    })
    const runtimeEntries = timeline.filter((entry) => entry.kind === "runtime")

    expect(runtimeEntries).toHaveLength(2)
    expect(buildMotionRuntimeActivity({
      events: runtimeEntries[0]?.kind === "runtime" ? runtimeEntries[0].events : [],
    }).items[0]?.status).toBe("done")
    expect(buildMotionRuntimeActivity({
      events: runtimeEntries[1]?.kind === "runtime" ? runtimeEntries[1].events : [],
    }).items[0]?.status).toBe("pending")
  })

  test("settles unresolved runtime work once assistant reply text starts streaming", () => {
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          state: "input-available",
        },
        {
          type: "text",
          id: "reply-1",
          text: "The updated frame is centered.",
          state: "streaming",
        },
      ],
    })
    const runtimeEntry = timeline.find((entry) => entry.kind === "runtime")

    expect(runtimeEntry).toEqual(expect.objectContaining({ kind: "runtime" }))
    expect(buildMotionRuntimeActivity({
      events: runtimeEntry?.kind === "runtime" ? runtimeEntry.events : [],
    }).items[0]).toEqual(expect.objectContaining({
      title: "Checked current frame",
      status: "done",
    }))
  })

  test("allows live thinking after narration but removes it once clearer work appears", () => {
    const thinkingTimeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "text",
          id: "text-1",
          text: "I am checking the current frame first.",
        },
        {
          type: "reasoning",
          id: "reason-1",
          text: "Need to inspect the current preview.",
          state: "streaming",
        },
      ],
    })
    const thinkingItems = thinkingTimeline.flatMap((entry) =>
      entry.kind === "runtime"
        ? buildMotionRuntimeActivity({ parts: entry.parts, events: entry.events }).items
        : []
    )

    expect(thinkingItems).toEqual([
      expect.objectContaining({
        kind: "thinking",
        title: "Thinking",
        status: "pending",
      }),
    ])

    const speakingTimeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "text",
          id: "text-1",
          text: "I am checking the current frame first.",
        },
        {
          type: "reasoning",
          id: "reason-1",
          text: "Need to inspect the current preview.",
          state: "done",
        },
        {
          type: "text",
          id: "text-2",
          text: "The frame is centered.",
          state: "streaming",
        },
      ],
    })
    const speakingItems = speakingTimeline.flatMap((entry) =>
      entry.kind === "runtime"
        ? buildMotionRuntimeActivity({ parts: entry.parts, events: entry.events }).items
        : []
    )

    expect(speakingItems.some((item) => item.kind === "thinking")).toBe(false)

    const workingTimeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "text",
          id: "text-1",
          text: "I am checking the current frame first.",
        },
        {
          type: "reasoning",
          id: "reason-1",
          text: "Need to inspect the current preview.",
          state: "streaming",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          state: "input-available",
        },
      ],
    })
    const workingItems = workingTimeline.flatMap((entry) =>
      entry.kind === "runtime"
        ? buildMotionRuntimeActivity({ parts: entry.parts, events: entry.events }).items
        : []
    )

    expect(workingItems.map((item) => [item.kind, item.title, item.status])).toEqual([
      ["motion_change", "Updating composition", "pending"],
    ])
  })

  test("coalesces Codex shell inspection into one explored umbrella", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "ls-1",
          input: { command: "/bin/zsh -lc ls" },
          output: { exitCode: 0, stdout: "index.html\nassets\n" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "sed-1",
          input: {
            command: "/bin/zsh -lc \"sed -n '360,435p' index.html\"",
            parsed_cmd: [{
              type: "read",
              name: "index.html",
              path: "/Users/motion/project/index.html",
            }],
          },
          output: { exitCode: 0, stdout: "<style>...</style>" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "rg-1",
          input: {
            command: "/bin/zsh -lc 'rg -n \"phone|top\" index.html'",
            parsed_cmd: [{
              type: "search",
              query: "phone|top",
              path: "index.html",
            }],
          },
          output: { exitCode: 0, stdout: "400: top: 295px;" },
          state: "output-available",
        },
      ],
    })

    expect(projection.items.map((item) => item.title)).toEqual([
      "Explored 1 file, 1 list, 1 search",
    ])
    expect(projection.items[0]).toEqual(expect.objectContaining({
      kind: "explored",
      subtitle: "",
      collapsible: true,
      details: [
        expect.objectContaining({ label: "Listed files" }),
        expect.objectContaining({ label: "Read index.html", value: "" }),
        expect.objectContaining({ label: "Searched index.html", value: "phone|top" }),
      ],
    }))
  })

  test("counts repeated reads of the same project file once in the explored umbrella", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "sed-1",
          input: {
            command: "/bin/zsh -lc \"sed -n '240,620p' index.html\"",
            parsed_cmd: [{
              type: "read",
              name: "index.html",
              path: "/Users/motion/project/index.html",
            }],
          },
          output: { exitCode: 0, stdout: "<style>...</style>" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "sed-2",
          input: {
            command: "/bin/zsh -lc \"sed -n '620,980p' index.html\"",
            parsed_cmd: [{
              type: "read",
              name: "index.html",
              path: "/Users/motion/project/index.html",
            }],
          },
          output: { exitCode: 0, stdout: "<script>...</script>" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "tail-1",
          input: {
            command: "/bin/zsh -lc 'tail -n 160 index.html'",
            parsed_cmd: [{
              type: "read",
              name: "index.html",
              path: "/Users/motion/project/index.html",
            }],
          },
          output: { exitCode: 0, stdout: "gsap.set(...)" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "rg-1",
          input: {
            command: "/bin/zsh -lc 'rg -n \"s3-phone|left\" index.html'",
            parsed_cmd: [{
              type: "search",
              query: "s3-phone|left",
              path: "index.html",
            }],
          },
          output: { exitCode: 0, stdout: "392: left: 50%;" },
          state: "output-available",
        },
      ],
    })

    expect(projection.items[0]).toEqual(expect.objectContaining({
      title: "Explored 1 file, 1 search",
      details: [
        expect.objectContaining({ label: "Read index.html (3 reads)", value: "" }),
        expect.objectContaining({ label: "Searched index.html", value: "s3-phone|left" }),
      ],
    }))
  })

  test("uses motion-editor edit summaries without exposing files", () => {
    expect(buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          output: { status: "completed" },
          state: "output-available",
        },
      ],
    }).items[0]).toEqual(expect.objectContaining({
      kind: "motion_change",
      title: "Updated composition",
      subtitle: "",
    }))

    expect(buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: {
            file_path: "index.html",
            old_string: "top: 295px;",
            new_string: "top: 215px;",
          },
          state: "input-available",
        },
      ],
    }).items[0]).toEqual(expect.objectContaining({
      title: "Updating composition",
      subtitle: "",
      status: "pending",
    }))
  })

  test("settles stale preliminary checks once later activity is visible", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "diff-1",
          input: { command: "git diff -- index.html" },
          output: { stdout: "diff --git a/index.html b/index.html" },
          preliminary: true,
          state: "output-available",
        },
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            artifactPath: ".ripple/visual-context/snapshots/current.png",
          },
          state: "output-available",
        },
      ],
    })

    expect(projection.items.map((item) => [item.title, item.status])).toEqual([
      ["Checked changes", "done"],
      ["Checked current frame", "done"],
    ])
  })

  test("keeps the latest unfinished activity pending", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "tool-Bash",
          toolCallId: "lint-1",
          input: { command: "hyperframes lint ." },
          state: "input-available",
        },
      ],
    })

    expect(projection.items).toEqual([
      expect.objectContaining({
        title: "Checking project",
        status: "pending",
      }),
    ])
  })

  test("hides duplicate file-change summaries when an edit tool is present", () => {
    const diff = "diff --git a/index.html b/index.html\n-top: 295px;\n+top: 215px;"
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: { file_path: "index.html" },
          output: { status: "completed" },
        },
        {
          type: "data-agent-runtime",
          id: "file-change-1",
          data: {
            kind: "file_change",
            label: "Updated proposal diff",
            payload: { diff },
          },
        },
        {
          type: "data-agent-runtime",
          id: "file-change-2",
          data: {
            kind: "file_change",
            label: "Updated proposal diff",
            payload: { diff },
          },
        },
      ],
    })

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toEqual(expect.objectContaining({
      kind: "runtime",
      parts: [
        expect.objectContaining({
          type: "tool-Edit",
        }),
      ],
    }))
  })

  test("keeps one file-change summary when no concrete edit tool exists", () => {
    const diff = "diff --git a/index.html b/index.html\n-top: 295px;\n+top: 215px;"
    const timeline = buildMotionRuntimeTimeline({
      parts: [
        {
          type: "data-agent-runtime",
          id: "file-change-1",
          data: {
            kind: "file_change",
            label: "Updated proposal diff",
            payload: { diff },
          },
        },
        {
          type: "data-agent-runtime",
          id: "file-change-2",
          data: {
            kind: "file_change",
            label: "Updated proposal diff",
            payload: { diff },
          },
        },
      ],
    })

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toEqual(expect.objectContaining({
      kind: "runtime",
      parts: [
        expect.objectContaining({
          id: "file-change-1",
        }),
      ],
    }))
  })

  test("prefers shared product summaries over raw runtime labels", () => {
    const projection = buildMotionRuntimeActivity({
      parts: [
        {
          type: "data-agent-runtime",
          id: "status-1",
          data: {
            kind: "status",
            label: "Bash /Users/example/project/src/index.html",
            summary: {
              id: "summary-1",
              kind: "verification",
              status: "pending",
              title: "Checking project",
            },
            payload: {
              label: "Bash /Users/example/project/src/index.html",
            },
          },
        },
      ],
    })

    expect(projection.items).toEqual([
      expect.objectContaining({
        title: "Checking project",
        status: "pending",
      }),
    ])
    const visibleCopy = projection.items.map((item) => item.title).join("\n")
    expect(visibleCopy).not.toMatch(/Bash|\/Users|src\/index/)
    expect(projection.advancedDetails.map((detail) => detail.value).join("\n")).toContain("/Users/example")
  })
})
