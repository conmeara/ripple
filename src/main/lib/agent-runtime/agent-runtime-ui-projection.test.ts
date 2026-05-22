import { describe, expect, test } from "bun:test"
import {
  AgentRuntimeUIProjector,
  buildAgentRuntimeAssistantProjection,
} from "../../../shared/agent-runtime-ui-projection"

describe("AgentRuntimeUIProjector", () => {
  test("keeps provider tool ids stable across input, output, and completion", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = [
      ...projector.project({
        type: "tool_start",
        providerId: "cmd-1",
        payload: {
          toolName: "Bash",
          command: "echo ok",
          cwd: "/tmp/project",
        },
      }),
      ...projector.project({
        type: "tool_update",
        providerId: "cmd-1",
        payload: {
          toolName: "Bash",
          delta: "ok\n",
        },
      }),
      ...projector.project({
        type: "tool_end",
        providerId: "cmd-1",
        payload: {
          toolName: "Bash",
          output: "ok\n",
          exitCode: 0,
          status: "completed",
        },
      }),
    ]

    expect(chunks).toEqual([
      expect.objectContaining({
        type: "tool-input-start",
        toolCallId: "cmd-1",
        toolName: "Bash",
      }),
      expect.objectContaining({
        type: "tool-input-available",
        toolCallId: "cmd-1",
        input: expect.objectContaining({ command: "echo ok" }),
      }),
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "cmd-1",
        preliminary: true,
        output: expect.objectContaining({ output: "ok\n" }),
      }),
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "cmd-1",
        output: expect.objectContaining({ output: "ok\n", exitCode: 0 }),
      }),
    ])
  })

  test("projects reasoning as first-class AI SDK reasoning chunks", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = [
      ...projector.project({
        type: "reasoning",
        providerId: "reason-1",
        payload: { delta: "Check the file first." },
      }),
      ...projector.project({
        type: "assistant_text_delta",
        providerId: "msg-1",
        payload: { delta: "Done." },
      }),
    ]

    expect(chunks).toEqual([
      expect.objectContaining({ type: "reasoning-start", id: "reasoning-reason-1" }),
      expect.objectContaining({
        type: "reasoning-delta",
        id: "reasoning-reason-1",
        delta: "Check the file first.",
      }),
      { type: "reasoning-end", id: "reasoning-reason-1" },
      expect.objectContaining({ type: "text-start", id: "text-msg-1" }),
      expect.objectContaining({ type: "text-delta", id: "text-msg-1", delta: "Done." }),
    ])
  })

  test("coalesces Claude reasoning deltas with changing provider ids", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = [
      ...projector.project({
        type: "reasoning",
        providerType: "content_block_delta",
        providerId: "claude-thinking-1",
        payload: { delta: "Inspect the frame first. " },
      }),
      ...projector.project({
        type: "reasoning",
        providerType: "content_block_delta",
        providerId: "claude-thinking-2",
        payload: { delta: "No file edit is needed." },
      }),
      ...projector.project({
        type: "reasoning",
        providerType: "assistant:thinking",
        providerId: "claude-thinking-final",
        payload: {
          text: "Inspect the frame first. No file edit is needed.",
        },
      }),
    ]

    expect(chunks).toEqual([
      expect.objectContaining({ type: "reasoning-start", id: "reasoning-claude-thinking-1" }),
      expect.objectContaining({
        type: "reasoning-delta",
        id: "reasoning-claude-thinking-1",
        delta: "Inspect the frame first. ",
      }),
      expect.objectContaining({
        type: "reasoning-delta",
        id: "reasoning-claude-thinking-1",
        delta: "No file edit is needed.",
      }),
      { type: "reasoning-end", id: "reasoning-claude-thinking-1" },
    ])
  })

  test("keeps provider capability status out of visible assistant parts", () => {
    const projector = new AgentRuntimeUIProjector()

    expect(projector.project({
      type: "status",
      providerType: "codex:capabilities",
      providerId: "run-1",
      payload: {
        status: "running",
        label: "Loaded Codex context: 1 MCP server, Ripple policy",
        capabilities: { appServer: true },
        sessionInit: { tools: ["Bash"] },
      },
    })).toEqual([])

    expect(projector.project({
      type: "status",
      providerType: "thread/compacted",
      providerId: "turn-1",
      payload: {
        status: "running",
        label: "Compacted context",
      },
    })).toEqual([
      expect.objectContaining({
        type: "data-agent-runtime",
        data: expect.objectContaining({
          kind: "status",
          label: "Compacted context",
        }),
      }),
    ])

    expect(projector.project({
      type: "activity",
      providerType: "tool_use_summary",
      providerId: "activity-1",
      payload: {
        kind: "searching",
        label: "Looking up reference",
      },
    })).toEqual([])
  })

  test("keeps provider user/tool-result messages out of assistant text", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "",
      events: [
        {
          id: "skill-body",
          type: "assistant_message",
          providerType: "user",
          providerId: "skill-body",
          payload: {
            text: "Base directory for this skill: /Users/example/.codex/worktrees/demo",
          },
        },
        {
          id: "assistant-final",
          type: "assistant_message",
          providerType: "assistant",
          providerId: "assistant-final",
          payload: {
            text: "The current frame shows a centered title card.",
          },
        },
      ],
    })

    expect(projection.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "The current frame shows a centered title card.",
      }),
    ])
  })

  test("keeps separate Claude assistant messages before and after tools", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "",
      events: [
        {
          type: "assistant_message",
          providerType: "assistant",
          providerId: "claude-message-1",
          payload: { text: "I found the phone position. I’ll move it right." },
        },
        {
          type: "tool_start",
          providerType: "assistant:tool_use",
          providerId: "tool-1",
          payload: {
            toolCallId: "tool-1",
            toolName: "Edit",
            input: { file_path: "index.html" },
          },
        },
        {
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "tool-1",
          payload: {
            toolCallId: "tool-1",
            toolName: "Edit",
            output: "File updated.",
            status: "completed",
          },
        },
        {
          type: "assistant_message",
          providerType: "assistant",
          providerId: "claude-message-2",
          payload: { text: "Moved the phone 100px to the right and checked the frame." },
        },
      ],
    })

    expect(projection.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "I found the phone position. I’ll move it right.",
        state: "done",
      }),
      expect.objectContaining({
        type: "tool-Edit",
        toolCallId: "tool-1",
        state: "output-available",
      }),
      expect.objectContaining({
        type: "text",
        text: "Moved the phone 100px to the right and checked the frame.",
        state: "done",
      }),
    ])
  })

  test("does not duplicate a completed assistant message for an already streamed text item", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "",
      events: [
        {
          type: "assistant_text_delta",
          providerType: "content_block_delta",
          providerId: "message-1",
          payload: { delta: "Done." },
        },
        {
          type: "assistant_message",
          providerType: "assistant",
          providerId: "message-1",
          payload: { text: "Done." },
        },
      ],
    })

    expect(projection.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "Done.",
        state: "done",
      }),
    ])
  })

  test("keeps streamed Claude narration visible before following tool work", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "",
      events: [
        {
          type: "assistant_text_delta",
          providerType: "content_block_delta",
          providerId: "claude-message-1",
          payload: { delta: "I see the phone. I’ll move it right." },
        },
        {
          type: "tool_start",
          providerType: "assistant:tool_use",
          providerId: "edit-1",
          payload: {
            toolCallId: "edit-1",
            toolName: "Edit",
            input: { file_path: "index.html" },
          },
        },
        {
          type: "assistant_message",
          providerType: "assistant",
          providerId: "claude-message-1",
          payload: { text: "I see the phone. I’ll move it right." },
        },
        {
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "edit-1",
          payload: {
            toolCallId: "edit-1",
            toolName: "Edit",
            status: "completed",
          },
        },
      ],
    })

    expect(projection.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "I see the phone. I’ll move it right.",
        state: "done",
      }),
      expect.objectContaining({
        type: "tool-Edit",
        toolCallId: "edit-1",
        state: "output-available",
      }),
    ])
  })

  test("projects lightweight thinking activity while suppressing repeated noise", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = [
      ...projector.project({
        type: "activity",
        providerId: "activity-1",
        payload: {
          kind: "thinking",
          label: "Agent is thinking",
        },
      }),
      ...projector.project({
        type: "activity",
        providerId: "activity-2",
        payload: {
          kind: "thinking",
          label: "Agent is thinking",
        },
      }),
      ...projector.project({
        type: "activity",
        providerId: "activity-3",
        payload: {
          kind: "writing",
          label: "Writing a response",
        },
      }),
    ]

    expect(chunks).toEqual([
      expect.objectContaining({
        type: "data-agent-runtime",
        id: "activity-activity-1",
        data: expect.objectContaining({
          kind: "status",
          label: "Thinking",
        }),
      }),
    ])
  })

  test("projects pending approvals as visible runtime data", () => {
    const projector = new AgentRuntimeUIProjector()

    expect(projector.project({
      type: "approval_request",
      providerId: "approval-1",
      payload: {
        approvalId: "approval-1",
        kind: "network",
        status: "pending",
        prompt: "Allow network access?",
      },
    })).toEqual([
      expect.objectContaining({
        type: "data-agent-runtime",
        id: "approval-approval-1",
        data: expect.objectContaining({
          kind: "approval",
          label: "Approval needed",
          payload: expect.objectContaining({
            approvalId: "approval-1",
            status: "pending",
          }),
        }),
      }),
    ])
  })

  test("projects runtime data with shared product summaries", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = [
      ...projector.project({
        id: "event-file-change",
        agentRunId: "run-1",
        sequence: 7,
        type: "file_change",
        provider: "codex",
        providerId: "file-change-1",
        payload: {
          path: "/Users/example/project/src/index.html",
          diff: "diff --git a/src/index.html b/src/index.html\n-Bash\n+Preview",
        },
      }),
      ...projector.project({
        id: "event-approval",
        agentRunId: "run-1",
        sequence: 8,
        type: "approval_request",
        provider: "claude",
        providerId: "approval-1",
        payload: {
          approvalId: "approval-1",
          kind: "command",
          status: "pending",
          command: "Bash hyperframes lint /Users/example/project",
        },
      }),
    ]

    const summaries = chunks
      .filter((chunk) => chunk.type === "data-agent-runtime")
      .map((chunk) => chunk.data?.summary)

    expect(summaries).toEqual([
      expect.objectContaining({
        kind: "motion_edit",
        status: "done",
        title: "Updated composition",
        providerRefs: [
          expect.objectContaining({
            eventId: "event-file-change",
            sequence: 7,
            provider: "codex",
            runId: "run-1",
          }),
        ],
      }),
      expect.objectContaining({
        kind: "approval",
        status: "pending",
        title: "Approval needed",
        providerRefs: [
          expect.objectContaining({
            eventId: "event-approval",
            sequence: 8,
            provider: "claude",
            runId: "run-1",
          }),
        ],
      }),
    ])

    for (const summary of summaries) {
      expect(summary.title).not.toMatch(/Bash|Edit|Write|\/Users|src\/index|codex|claude/i)
    }
  })

  test("sanitizes technical status labels in projected runtime summaries", () => {
    const projector = new AgentRuntimeUIProjector()
    const chunks = projector.project({
      id: "event-status",
      agentRunId: "run-1",
      sequence: 9,
      type: "status",
      provider: "codex",
      providerId: "status-1",
      payload: {
        status: "running",
        label: "Bash /Users/example/project/src/index.html stdout={\"ok\":true}",
      },
    })

    expect(chunks).toEqual([
      expect.objectContaining({
        type: "data-agent-runtime",
        data: expect.objectContaining({
          label: "Bash /Users/example/project/src/index.html stdout={\"ok\":true}",
          summary: expect.objectContaining({
            kind: "status",
            title: "Checking project",
          }),
        }),
      }),
    ])
  })

  test("preserves provider refs on projected runtime parts", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Fallback",
      events: [
        {
          id: "event-1",
          agentRunId: "run-1",
          sequence: 1,
          createdAt: "2026-05-21T12:00:00.000Z",
          type: "tool_start",
          providerType: "item/started",
          providerId: "cmd-1",
          payload: {
            toolName: "Bash",
            command: "pwd",
            providerRefs: {
              provider: "codex",
              requestId: "request-1",
              turnId: "turn-1",
              rawProviderMethod: "item/started",
              rawPayload: { method: "item/started" },
            },
          },
        },
        {
          id: "event-2",
          type: "tool_end",
          providerType: "item/completed",
          providerId: "cmd-1",
          payload: {
            toolName: "Bash",
            output: "/tmp/project\n",
            status: "completed",
          },
        },
      ],
    })

    expect(projection.parts[0]).toEqual(expect.objectContaining({
      type: "tool-Bash",
      providerRefs: [
        expect.objectContaining({
          eventId: "event-1",
          sequence: 1,
          createdAt: "2026-05-21T12:00:00.000Z",
          provider: "codex",
          runId: "run-1",
          requestId: "request-1",
          turnId: "turn-1",
          itemId: "cmd-1",
          rawProviderMethod: "item/started",
          rawPayload: { method: "item/started" },
        }),
        expect.objectContaining({
          eventId: "event-2",
          rawProviderMethod: "item/completed",
        }),
      ],
    }))
  })

  test("lifecycle closure settles unfinished tool rows", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Fallback",
      events: [
        {
          type: "tool_start",
          providerId: "cmd-1",
          payload: { toolName: "Bash", command: "hyperframes lint" },
        },
        {
          type: "turn.completed",
          providerType: "ripple:runtime",
          providerId: "turn-1",
          payload: { status: "completed", turnId: "turn-1" },
        },
      ],
    })

    expect(projection.parts[0]).toEqual(expect.objectContaining({
      type: "tool-Bash",
      state: "output-available",
      output: expect.objectContaining({
        output: "",
      }),
    }))
  })

  test("lifecycle closure preserves interrupted tool failures", () => {
    for (const status of ["failed", "cancelled", "recoverable"] as const) {
      const projection = buildAgentRuntimeAssistantProjection({
        fallbackText: "Fallback",
        events: [
          {
            type: "tool_start",
            providerId: `cmd-${status}`,
            payload: { toolName: "Bash", command: "hyperframes lint" },
          },
          {
            type: "request.completed",
            providerType: "ripple:runtime",
            providerId: "request-1",
            payload: { status, message: status === "failed" ? "Provider failed." : undefined },
          },
        ],
      })

      expect(projection.parts[0]).toEqual(expect.objectContaining({
        type: "tool-Bash",
        state: "output-error",
        errorText: status === "failed"
          ? "Provider failed."
          : expect.stringContaining(status === "cancelled" ? "cancelled" : "restarted"),
      }))
    }
  })

  test("terminal status events settle unfinished tools with the terminal state", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Fallback",
      events: [
        {
          type: "tool_start",
          providerId: "cmd-1",
          payload: { toolName: "Bash", command: "hyperframes lint" },
        },
        {
          type: "status",
          providerType: "ripple:runtime",
          providerId: "run-1",
          payload: { status: "cancelled" },
        },
      ],
    })

    expect(projection.parts[0]).toEqual(expect.objectContaining({
      type: "tool-Bash",
      state: "output-error",
      errorText: expect.stringContaining("cancelled"),
    }))
  })

  test("builds persisted assistant parts with tools, reasoning, and usage metadata", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Fallback",
      events: [
        {
          type: "reasoning",
          providerId: "reason-1",
          payload: { delta: "Need to inspect." },
        },
        {
          type: "tool_start",
          providerId: "cmd-1",
          payload: { toolName: "Bash", command: "pwd" },
        },
        {
          type: "tool_end",
          providerId: "cmd-1",
          payload: {
            toolName: "Bash",
            output: "/tmp/project\n",
            exitCode: 0,
            status: "completed",
          },
        },
        {
          type: "usage",
          payload: {
            tokenUsage: {
              total: {
                inputTokens: 10,
                cachedInputTokens: 2,
                outputTokens: 5,
                reasoningOutputTokens: 3,
                totalTokens: 18,
              },
            },
          },
        },
        {
          type: "assistant_message",
          providerId: "msg-1",
          payload: { text: "Finished." },
        },
      ],
    })

    expect(projection.parts).toEqual([
      expect.objectContaining({
        type: "reasoning",
        text: "Need to inspect.",
        state: "done",
      }),
      expect.objectContaining({
        type: "tool-Bash",
        toolCallId: "cmd-1",
        state: "output-available",
        output: "/tmp/project\n",
      }),
      expect.objectContaining({
        type: "text",
        text: "Finished.",
        state: "done",
      }),
    ])
    expect(projection.metadata).toEqual(expect.objectContaining({
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 3,
      cacheReadInputTokens: 2,
      totalTokens: 18,
    }))
  })
})
