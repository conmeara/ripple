import { describe, expect, test } from "bun:test"
import {
  createAgentRunReplayObservable,
  type AgentRunReplayMessage,
} from "./run-replay-subscription"

type ReplayEvent = Extract<AgentRunReplayMessage, { type: "event" }>["event"]

function collectReplay(
  replay: ReturnType<typeof createAgentRunReplayObservable>,
): Promise<AgentRunReplayMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: AgentRunReplayMessage[] = []
    replay.subscribe({
      next: (message) => messages.push(message),
      error: reject,
      complete: () => resolve(messages),
    })
  })
}

describe("agent run replay subscription", () => {
  test("replays persisted events in sequence and completes on terminal status", async () => {
    let unsubscribed = false
    const run = { id: "run-1", status: "completed", provider: "codex", model: "gpt-5.1-codex" }
    const events: ReplayEvent[] = [
      {
        id: "event-1",
        agentRunId: "run-1",
        sequence: 1,
        type: "assistant_text_delta",
        payload: { delta: "Done" },
      },
      {
        id: "event-2",
        agentRunId: "run-1",
        sequence: 2,
        type: "status",
        payload: { status: "completed" },
      },
    ]

    const messages = await collectReplay(createAgentRunReplayObservable("run-1", {
      getRun: () => run,
      listEvents: () => events,
      subscribe: () => {
        return () => {
          unsubscribed = true
        }
      },
    }))

    expect(messages).toEqual([
      { type: "run", run, reused: true, replayed: true },
      { type: "event", event: events[0] },
      { type: "event", event: events[1] },
      { type: "run-complete", run },
    ])
    expect(unsubscribed).toBe(true)
  })

  test("buffers live events during persisted replay, dedupes, then tails in order", async () => {
    let liveHandler: ((event: ReplayEvent) => void) | null = null
    let currentRun = { id: "run-1", status: "running", provider: "claude", model: "claude-sonnet" }
    const replayedEvent: ReplayEvent = {
      id: "event-1",
      agentRunId: "run-1",
      sequence: 1,
      type: "reasoning",
      payload: { text: "Thinking" },
    }
    const duplicatedLiveEvent: ReplayEvent = {
      id: "event-1",
      agentRunId: "run-1",
      sequence: 1,
      type: "reasoning",
      payload: { text: "Thinking" },
    }
    const tailedEvent: ReplayEvent = {
      id: "event-2",
      agentRunId: "run-1",
      sequence: 2,
      type: "tool_start",
      payload: { toolName: "Edit" },
    }
    const terminalEvent: ReplayEvent = {
      id: "event-3",
      agentRunId: "run-1",
      sequence: 3,
      type: "status",
      payload: { status: "completed" },
    }

    const messages = await collectReplay(createAgentRunReplayObservable("run-1", {
      getRun: () => currentRun,
      listEvents: () => {
        liveHandler?.(terminalEvent)
        liveHandler?.(duplicatedLiveEvent)
        liveHandler?.(tailedEvent)
        currentRun = { ...currentRun, status: "completed" }
        return [replayedEvent]
      },
      subscribe: (_runId, onEvent) => {
        liveHandler = onEvent
        return () => {
          liveHandler = null
        }
      },
    }))

    expect(messages.map((message) =>
      message.type === "event" ? message.event.id : message.type
    )).toEqual([
      "run",
      "event-1",
      "event-2",
      "event-3",
      "run-complete",
    ])
    expect(messages.at(-1)).toEqual({
      type: "run-complete",
      run: expect.objectContaining({ status: "completed" }),
    })
  })
})
