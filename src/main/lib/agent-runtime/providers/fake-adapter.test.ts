import { describe, expect, test } from "bun:test"
import { FakeAgentAdapter } from "./fake-adapter"
import type { AgentProviderEventSink, AgentProviderRunInput } from "../types"

describe("FakeAgentAdapter", () => {
  test("emits normalized runtime events and returns provider ids", async () => {
    const adapter = new FakeAgentAdapter()
    const events: any[] = []
    const sink: AgentProviderEventSink = {
      emit: async (event) => {
        events.push(event)
        return { id: `event-${events.length}` } as any
      },
      requestApproval: async () => ({
        approvalId: "approval-1",
        approved: true,
      }),
      setProviderIds: async () => {},
      isCancellationRequested: () => false,
    }
    const result = await adapter.run({
      run: { id: "run-1" },
      thread: { id: "thread-1", providerThreadId: null },
      workspace: { path: "/tmp/ripple-workspace" },
      connection: { id: "connection-1" },
      prompt: "Make the title bigger.",
      cwd: "/tmp/ripple-workspace",
      mode: "agent",
      model: "fake-agent",
    } as AgentProviderRunInput, sink)

    expect(result.summary).toContain("main-process agent runtime")
    expect(result.providerThreadId).toBe("fake-thread-thread-1")
    expect(events.map((event) => event.type)).toEqual([
      "status",
      "tool_start",
      "tool_end",
      "assistant_message",
    ])
  })
})
