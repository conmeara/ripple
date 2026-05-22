import { describe, expect, mock, test } from "bun:test"

class TestStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  clear() {
    this.values.clear()
  }
}

const localStorage = new TestStorage()
const sessionStorage = new TestStorage()
Object.assign(globalThis, {
  localStorage,
  sessionStorage,
  window: {
    location: {
      search: "",
      hash: "",
    },
    dispatchEvent: () => true,
  },
})

type SubscriptionHandlers = {
  onData: (message: any) => void
  onError: (error: Error) => void
  onComplete: () => void
}

const resumeRunSubscriptions: Array<{
  input: { runId: string }
  handlers: SubscriptionHandlers
  unsubscribed: boolean
}> = []

mock.module("sonner", () => ({
  toast: {
    error: () => {},
  },
}))

mock.module("../../../lib/trpc", () => ({
  trpcClient: {
    agentRuntime: {
      cancelRun: {
        mutate: async () => ({ ok: true }),
      },
      chat: {
        subscribe: () => ({
          unsubscribe: () => {},
        }),
      },
      resumeRun: {
        subscribe: (input: { runId: string }, handlers: SubscriptionHandlers) => {
          const subscription = {
            input,
            handlers,
            unsubscribed: false,
          }
          resumeRunSubscriptions.push(subscription)
          return {
            unsubscribe: () => {
              subscription.unsubscribed = true
            },
          }
        },
      },
    },
  },
}))

const { agentChatStore } = await import("../stores/agent-chat-store")
const { AgentRuntimeChatTransport } = await import("./agent-runtime-chat-transport")

async function readAll(stream: ReadableStream<any>): Promise<any[]> {
  const reader = stream.getReader()
  const chunks: any[] = []
  while (true) {
    const result = await reader.read()
    if (result.done) return chunks
    chunks.push(result.value)
  }
}

describe("AgentRuntimeChatTransport", () => {
  test("replays persisted run events through the AI SDK stream", async () => {
    resumeRunSubscriptions.length = 0
    agentChatStore.setStreamId("sub-chat-1", "agent-run-run-1")

    const transport = new AgentRuntimeChatTransport({
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      mode: "agent",
      provider: "codex",
      model: "gpt-5.1-codex",
      runtimeContext: {
        projectId: "project-1",
        compositionId: "composition-1",
      },
    })
    const stream = await transport.reconnectToStream()
    expect(stream).not.toBeNull()
    expect(resumeRunSubscriptions).toHaveLength(1)
    expect(resumeRunSubscriptions[0]?.input).toEqual({ runId: "run-1" })

    const chunksPromise = readAll(stream!)
    const handlers = resumeRunSubscriptions[0]!.handlers
    handlers.onData({
      type: "run",
      run: {
        id: "run-1",
        provider: "codex",
        model: "gpt-5.1-codex",
      },
    })
    handlers.onData({
      type: "event",
      event: {
        id: "event-1",
        agentRunId: "run-1",
        sequence: 1,
        type: "file_change",
        provider: "codex",
        providerId: "file-change-1",
        payload: {
          path: "/Users/example/project/src/index.html",
          diff: "diff --git a/src/index.html b/src/index.html",
        },
      },
    })
    handlers.onData({
      type: "event",
      event: {
        id: "event-2",
        agentRunId: "run-1",
        sequence: 2,
        type: "status",
        payload: { status: "completed" },
      },
    })

    const chunks = await chunksPromise
    expect(chunks[0]).toEqual(expect.objectContaining({
      type: "start",
      messageId: "agent-run-run-1",
      messageMetadata: expect.objectContaining({
        agentRunId: "run-1",
        provider: "codex",
        model: "gpt-5.1-codex",
        replayed: true,
      }),
    }))
    expect(chunks).toContainEqual(expect.objectContaining({
      type: "data-agent-runtime",
      data: expect.objectContaining({
        kind: "file_change",
        label: "Updated composition",
        summary: expect.objectContaining({
          kind: "motion_edit",
          title: "Updated composition",
          providerRefs: [
            expect.objectContaining({
              eventId: "event-1",
              runId: "run-1",
              sequence: 1,
            }),
          ],
        }),
      }),
    }))
    expect(chunks.at(-1)).toEqual(expect.objectContaining({
      type: "finish",
      finishReason: "stop",
      messageMetadata: expect.objectContaining({
        agentRunId: "run-1",
      }),
    }))
    expect(agentChatStore.getStreamId("sub-chat-1")).toBeNull()
    expect(resumeRunSubscriptions[0]?.unsubscribed).toBe(true)
  })
})
