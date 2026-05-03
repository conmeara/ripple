import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import {
  AgentRuntimeUIProjector,
  parseRuntimeEventPayload,
} from "../../../../shared/agent-runtime-ui-projection"
import {
  codexApiKeyAtom,
  normalizeCodexApiKey,
  sessionInfoAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import { buildAgentRuntimeMessageInput } from "./agent-runtime-message-input"

type UIMessageChunk = any

type AgentRuntimeProvider = "codex" | "claude" | "fake"

export type AgentRuntimeChatContext = {
  compositionId?: string | null
  previewTimeSeconds?: number | null
  previewFrame?: number | null
  previewSource?:
    | { kind: "main" }
    | { kind: "comment-revision"; revisionId: string }
    | { kind: "chat-worktree"; conversationId?: string | null; chatId?: string | null }
    | { kind: "export"; exportJobId?: string | null; sourceLabel?: string | null }
    | null
  commentThreadId?: string | null
  revisionId?: string | null
  exportJobId?: string | null
}

type AgentRuntimeChatTransportConfig = {
  chatId: string
  subChatId: string
  mode: "plan" | "agent"
  provider: AgentRuntimeProvider
  model?: string | null
  runtimeContext?: AgentRuntimeChatContext | (() => AgentRuntimeChatContext | null) | null
}

type RuntimeEvent = {
  id?: string
  type?: string
  providerId?: string | null
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function applyRuntimeSessionInfo(payload: Record<string, unknown>) {
  const sessionInit = payload.sessionInit
  if (!isRecord(sessionInit)) return

  const previous = appStore.get(sessionInfoAtom)
  const hasTools = Array.isArray(sessionInit.tools)
  const hasMcpServers = Array.isArray(sessionInit.mcpServers)
  const hasPlugins = Array.isArray(sessionInit.plugins)
  const hasSkills = Array.isArray(sessionInit.skills)
  const tools = toStringArray(sessionInit.tools)
  const mcpServers = Array.isArray(sessionInit.mcpServers)
    ? sessionInit.mcpServers
    : []
  const plugins = Array.isArray(sessionInit.plugins) ? sessionInit.plugins : []
  const skills = toStringArray(sessionInit.skills)

  appStore.set(sessionInfoAtom, {
    tools: hasTools ? tools : previous?.tools ?? [],
    mcpServers: hasMcpServers ? mcpServers : previous?.mcpServers ?? [],
    plugins: hasPlugins ? plugins : previous?.plugins ?? [],
    skills: hasSkills ? skills : previous?.skills ?? [],
  })
}

export class AgentRuntimeChatTransport implements ChatTransport<UIMessage> {
  readonly provider: AgentRuntimeProvider

  constructor(private readonly config: AgentRuntimeChatTransportConfig) {
    this.provider = config.provider
  }

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    const lastUser = [...options.messages]
      .reverse()
      .find((message) => message.role === "user")
    const runtimeInput = buildAgentRuntimeMessageInput(lastUser as any)
    const prompt = runtimeInput.prompt
    const requestId = `${this.config.subChatId}:${lastUser?.id || crypto.randomUUID()}`
    const runtimeContext = typeof this.config.runtimeContext === "function"
      ? this.config.runtimeContext()
      : this.config.runtimeContext
    const codexApiKey = this.config.provider === "codex"
      ? normalizeCodexApiKey(appStore.get(codexApiKeyAtom))
      : null

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        const projector = new AgentRuntimeUIProjector()
        let sub: { unsubscribe: () => void } | null = null
        let runId: string | null = null
        let started = false
        let closed = false
        let finishReason = "stop"
        const messageMetadata: Record<string, unknown> = {
          agentRunId: null,
          provider: this.config.provider,
          model: this.config.model,
        }

        const enqueue = (chunk: UIMessageChunk) => {
          if (closed) return
          try {
            controller.enqueue(chunk)
          } catch {
            closed = true
          }
        }

        const ensureStarted = () => {
          if (started) return
          started = true
          messageMetadata.agentRunId = runId
          enqueue({
            type: "start",
            messageId: runId ? `agent-run-${runId}` : undefined,
            messageMetadata: { ...messageMetadata },
          })
        }

        const enqueueProjectedChunk = (chunk: UIMessageChunk) => {
          ensureStarted()
          if (chunk.type === "message-metadata") {
            Object.assign(messageMetadata, chunk.messageMetadata ?? {})
            enqueue({
              ...chunk,
              messageMetadata: { ...messageMetadata },
            })
            return
          }
          if (chunk.type === "error") {
            finishReason = "error"
          }
          enqueue(chunk)
        }

        const finish = () => {
          if (closed) return
          ensureStarted()
          for (const chunk of projector.finish()) {
            enqueueProjectedChunk(chunk)
          }
          enqueue({
            type: "message-metadata",
            messageMetadata: { ...messageMetadata, agentRunId: runId },
          })
          enqueue({
            type: "finish",
            finishReason,
            messageMetadata: { ...messageMetadata, agentRunId: runId },
          })
          try {
            controller.close()
          } catch {
            // Stream already closed.
          }
          closed = true
          sub?.unsubscribe()
        }

        const handleRuntimeEvent = (event: RuntimeEvent) => {
          const payload = parseRuntimeEventPayload(event)
          applyRuntimeSessionInfo(payload)

          for (const chunk of projector.project(event)) {
            enqueueProjectedChunk(chunk)
          }

          if (event.type === "status") {
            const status = payload.status
            if (status === "failed") {
              finishReason = "error"
            }
            if (status === "completed" || status === "failed" || status === "cancelled") {
              finish()
            }
          }
        }

        const cancel = () => {
          if (runId) {
            void trpcClient.agentRuntime.cancelRun
              .mutate({ runId })
              .catch(() => {
                // Cancellation is best-effort once the provider is already stopping.
              })
          }
          finish()
        }

        options.abortSignal?.addEventListener("abort", cancel, { once: true })

        sub = trpcClient.agentRuntime.chat.subscribe(
          {
            target: { type: "conversation", conversationId: this.config.subChatId },
            provider: this.config.provider,
            prompt,
            requestId,
            mode: this.config.mode,
            model: this.config.model,
            conversationId: this.config.subChatId,
            chatId: null,
            subChatId: null,
            attachments: runtimeInput.attachments,
            runtimeContext: runtimeContext ?? null,
            ...(codexApiKey
              ? { authConfig: { apiKey: codexApiKey } }
              : {}),
          },
          {
            onData: (message: any) => {
              if (closed) return
              if (message.type === "run") {
                runId = message.run?.id ?? runId
                messageMetadata.agentRunId = runId
                ensureStarted()
                if (options.abortSignal?.aborted) cancel()
                return
              }
              if (message.type === "event") {
                handleRuntimeEvent(message.event)
                return
              }
              if (message.type === "error") {
                const errorText = message.message || "Agent run failed."
                toast.error("Agent run failed", { description: errorText })
                enqueueProjectedChunk({ type: "error", errorText })
                finish()
                return
              }
              if (message.type === "run-complete") {
                finish()
              }
            },
            onError: (error: Error) => {
              if (closed) return
              toast.error("Agent run failed", { description: error.message })
              enqueueProjectedChunk({ type: "error", errorText: error.message })
              finish()
            },
            onComplete: () => finish(),
          },
        )
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }

  cleanup(): void {
    // AgentRuntime runs are owned by the main process and survive renderer
    // remounts. There is no renderer-side provider process to clean up here.
  }
}
