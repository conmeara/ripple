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
      { type: "reasoning-start", id: "reasoning-reason-1" },
      {
        type: "reasoning-delta",
        id: "reasoning-reason-1",
        delta: "Check the file first.",
      },
      { type: "reasoning-end", id: "reasoning-reason-1" },
      { type: "text-start", id: "text-msg-1" },
      { type: "text-delta", id: "text-msg-1", delta: "Done." },
    ])
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
