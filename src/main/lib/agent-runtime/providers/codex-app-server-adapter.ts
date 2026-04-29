import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import type {
  AgentProviderAdapter,
  AgentProviderEventSink,
  AgentProviderRunInput,
  AgentProviderRunResult,
  ProviderAuthStatus,
} from "../types"
import { resolveProjectPathFromWorktree } from "../../claude-config"
import {
  resolveCodexMcpSnapshot,
  type CodexMcpSnapshot,
} from "../../trpc/routers/codex"
import { prepareAgentRuntimePrompt } from "../prompt-mentions"
import { getBundledCodexCliPath } from "./bundled-binaries"
import {
  extractItemText,
  getCodexAppServerErrorMessage,
  isCodexAppServerThreadNotFoundError,
  isTurnComplete,
  normalizeCodexAppServerNotification,
  type JsonRpcMessage,
} from "./codex-app-server-events"
import { buildCodexAppServerEnv } from "./codex-app-server-env"
import { normalizeCodexModelSelection } from "./codex-model-selection"

const activeClients = new Map<string, CodexAppServerClient>()

function getAppManagedCodexApiKey(input: AgentProviderRunInput): string | null {
  const apiKey = input.authConfig?.apiKey?.trim()
  return apiKey || null
}

function normalizeCodexMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName.replaceAll("/", "__")}`
}

function buildCodexMcpSessionInit(snapshot: CodexMcpSnapshot | null): {
  tools: string[]
  mcpServers: Array<{ name: string; status: string }>
  mcpServerNames: string[]
  unavailableMcpServerNames: string[]
} {
  if (!snapshot) {
    return {
      tools: [],
      mcpServers: [],
      mcpServerNames: [],
      unavailableMcpServerNames: [],
    }
  }

  const allServers = snapshot.groups.flatMap((group) => group.mcpServers)
  const tools = allServers.flatMap((server) =>
    server.tools.map((tool) => normalizeCodexMcpToolName(server.name, tool.name)),
  )
  const mcpServers = allServers.map((server) => ({
    name: server.name,
    status: server.status,
  }))
  return {
    tools,
    mcpServers,
    mcpServerNames: mcpServers
      .filter((server) => server.status === "connected")
      .map((server) => server.name)
      .sort(),
    unavailableMcpServerNames: mcpServers
      .filter((server) => server.status !== "connected")
      .map((server) => server.name)
      .sort(),
  }
}

function formatCodexCapabilityLabel(input: {
  mcpServerNames: string[]
  unavailableMcpServerNames: string[]
  hasMentions: boolean
}): string | null {
  const parts: string[] = []
  if (input.mcpServerNames.length > 0) {
    parts.push(`${input.mcpServerNames.length} MCP server${input.mcpServerNames.length === 1 ? "" : "s"}`)
  }
  if (input.unavailableMcpServerNames.length > 0) {
    parts.push(`${input.unavailableMcpServerNames.length} MCP unavailable`)
  }
  if (input.hasMentions) {
    parts.push("prompt context")
  }
  return parts.length > 0 ? `Loaded Codex context: ${parts.join(", ")}` : null
}

class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<
    number | string,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
    }
  >()
  private notificationHandlers = new Set<(message: JsonRpcMessage) => void>()
  private requestHandlers = new Set<(message: JsonRpcMessage) => Promise<any>>()

  constructor(
    private readonly binaryPath: string,
    private readonly env: NodeJS.ProcessEnv = buildCodexAppServerEnv(),
  ) {}

  async start(): Promise<void> {
    if (this.child) return
    this.child = spawn(this.binaryPath, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: this.env,
    })
    const child = this.child

    child.on("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error)
      }
      this.pending.clear()
    })

    child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim()
      if (text) {
        console.warn("[codex-app-server]", text)
      }
    })

    const lines = createInterface({ input: child.stdout })
    lines.on("line", (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let message: JsonRpcMessage
      try {
        message = JSON.parse(trimmed)
      } catch (error) {
        console.warn("[codex-app-server] Could not parse JSONL:", trimmed, error)
        return
      }
      void this.handleMessage(message)
    })

    await this.request("initialize", {
      clientInfo: {
        name: "ripple",
        title: "Ripple",
        version: "0.0.72",
      },
      capabilities: {},
    })
  }

  async stop(): Promise<void> {
    if (!this.child) return
    const child = this.child
    this.child = null
    child.kill()
    this.pending.clear()
  }

  onNotification(handler: (message: JsonRpcMessage) => void): () => void {
    this.notificationHandlers.add(handler)
    return () => this.notificationHandlers.delete(handler)
  }

  onRequest(handler: (message: JsonRpcMessage) => Promise<any>): () => void {
    this.requestHandlers.add(handler)
    return () => this.requestHandlers.delete(handler)
  }

  request(method: string, params?: any): Promise<any> {
    if (!this.child) {
      return Promise.reject(new Error("Codex App Server is not running."))
    }
    const id = this.nextId++
    const message = { id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child?.stdin.write(`${JSON.stringify(message)}\n`)
    })
  }

  respond(id: number | string, result: any): void {
    this.child?.stdin.write(`${JSON.stringify({ id, result })}\n`)
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.id !== undefined && message.method) {
      for (const handler of this.requestHandlers) {
        try {
          const result = await handler(message)
          if (result !== undefined) {
            this.respond(message.id, result)
            return
          }
        } catch (error) {
          this.respond(message.id, {
            error: error instanceof Error ? error.message : String(error),
          })
          return
        }
      }
      this.respond(message.id, {})
      return
    }

    for (const handler of this.notificationHandlers) {
      handler(message)
    }
  }
}

export class CodexAppServerAdapter implements AgentProviderAdapter {
  readonly provider = "codex"
  readonly runtime = "codex_app_server"

  async checkAuth(): Promise<ProviderAuthStatus> {
    try {
      const client = new CodexAppServerClient(getBundledCodexCliPath())
      await client.start()
      const response = await client.request("account/read", {})
      await client.stop()
      const account = response?.account ?? null
      return {
        provider: this.provider,
        runtime: this.runtime,
        connected: Boolean(account),
        authMode: account ? "chatgpt" : null,
        label: account
          ? "Codex App Server ready"
          : "Connect Codex before asking it to edit",
        safeAccount: {
          hasAccount: Boolean(account),
          requiresOpenaiAuth: response?.requiresOpenaiAuth,
        },
        setupAction: account ? "none" : "codex_login",
      }
    } catch (error) {
      return {
        provider: this.provider,
        runtime: this.runtime,
        connected: false,
        authMode: null,
        label: error instanceof Error ? error.message : "Codex setup is not available.",
        setupAction: "codex_login",
      }
    }
  }

  async run(
    input: AgentProviderRunInput,
    sink: AgentProviderEventSink,
  ): Promise<AgentProviderRunResult> {
    const appManagedApiKey = getAppManagedCodexApiKey(input)
    const client = new CodexAppServerClient(
      getBundledCodexCliPath(),
      buildCodexAppServerEnv(appManagedApiKey),
    )
    activeClients.set(input.run.id, client)
    let summary = ""
    let threadId = input.thread.providerThreadId ?? null
    let turnId: string | null = null
    const modelSelection = normalizeCodexModelSelection(input.model)
    const promptContext = prepareAgentRuntimePrompt(input.prompt)

    try {
      await client.start()
      const account = await client.request("account/read", {})
      if (!account?.account && !appManagedApiKey) {
        throw new Error("Connect Codex before asking it to edit.")
      }

      let codexMcpSnapshot: CodexMcpSnapshot | null = null
      try {
        const resolvedProjectPath = resolveProjectPathFromWorktree(input.cwd)
        codexMcpSnapshot = await resolveCodexMcpSnapshot({
          lookupPath: resolvedProjectPath || input.cwd,
        })
      } catch (error) {
        console.warn("[codex-app-server] Failed to resolve Codex MCP context:", error)
      }

      const codexSessionInit = buildCodexMcpSessionInit(codexMcpSnapshot)
      const hasPromptMentions =
        promptContext.agentMentions.length > 0 ||
        promptContext.skillMentions.length > 0 ||
        promptContext.toolMentions.length > 0
      const capabilityLabel = formatCodexCapabilityLabel({
        mcpServerNames: codexSessionInit.mcpServerNames,
        unavailableMcpServerNames: codexSessionInit.unavailableMcpServerNames,
        hasMentions: hasPromptMentions,
      })
      if (capabilityLabel) {
        await sink.emit({
          type: "status",
          providerType: "codex:capabilities",
          providerId: input.run.id,
          payload: {
            status: "running",
            label: capabilityLabel,
            capabilities: {
              appServer: true,
              localProfile: true,
              mcpServers: codexSessionInit.mcpServerNames,
              unavailableMcpServers: codexSessionInit.unavailableMcpServerNames,
            },
            sessionInit: {
              tools: codexSessionInit.tools,
              mcpServers: codexSessionInit.mcpServers,
              plugins: [],
              skills: [],
            },
            mentions: {
              agents: promptContext.agentMentions,
              skills: promptContext.skillMentions,
              tools: promptContext.toolMentions,
            },
          },
        })
      }

      const offRequest = client.onRequest(async (message) => {
        if (message.method === "item/commandExecution/requestApproval") {
          await sink.emit({
            type: "approval_request",
            providerType: message.method,
            providerId: String(message.id),
            payload: {
              kind: "command",
              command: message.params?.command,
              cwd: message.params?.cwd,
              reason: message.params?.reason,
              decision: "acceptForSession",
            },
          })
          return { decision: "acceptForSession" }
        }
        if (message.method === "item/fileChange/requestApproval") {
          await sink.emit({
            type: "approval_request",
            providerType: message.method,
            providerId: String(message.id),
            payload: {
              kind: "file_change",
              itemId: message.params?.itemId,
              decision: "acceptForSession",
            },
          })
          return { decision: "acceptForSession" }
        }
        if (message.method === "item/tool/requestUserInput") {
          await sink.emit({
            type: "approval_request",
            providerType: message.method,
            providerId: String(message.id),
            payload: {
              kind: "user_input",
              itemId: message.params?.itemId,
              questions: message.params?.questions,
              decision: "empty_answers",
            },
          })
          return { answers: {} }
        }
        if (message.method === "item/tool/call") {
          const callId = String(message.params?.callId ?? message.id)
          await sink.emit({
            type: "tool_start",
            providerType: message.method,
            providerId: callId,
            payload: {
              toolCallId: callId,
              toolName: message.params?.tool ?? "Tool",
              arguments: message.params?.arguments,
            },
          })
          await sink.emit({
            type: "tool_end",
            providerType: message.method,
            providerId: callId,
            payload: {
              toolCallId: callId,
              toolName: message.params?.tool ?? "Tool",
              status: "declined",
              error: "Ripple has not enabled this Codex dynamic tool.",
            },
          })
          return {
            success: false,
            contentItems: [
              {
                type: "inputText",
                text: "Ripple has not enabled this Codex dynamic tool.",
              },
            ],
          }
        }
        return {}
      })

      const runPromise = new Promise<void>((resolve, reject) => {
        const off = client.onNotification((message) => {
          void (async () => {
            try {
              if (message.method === "turn/started") {
                turnId = message.params?.turn?.id ?? turnId
                await sink.setProviderIds({ providerThreadId: threadId, providerTurnId: turnId })
              }

              if (message.method === "item/agentMessage/delta") {
                const delta = String(message.params?.delta ?? "")
                summary += delta
              } else if (message.method === "item/completed") {
                const text = extractItemText(message.params?.item)
                if (text) {
                  summary = text
                }
              }

              for (const event of normalizeCodexAppServerNotification(message)) {
                await sink.emit(event)
              }

              const errorMessage = getCodexAppServerErrorMessage(message)
              if (errorMessage && message.params?.willRetry !== true) {
                off()
                reject(new Error(errorMessage))
                return
              }

              if (isTurnComplete(message, turnId)) {
                off()
                resolve()
              }
            } catch (error) {
              off()
              reject(error)
            }
          })()
        })
      })

      const startThread = async () => {
        const threadStart = await client.request("thread/start", {
          cwd: input.cwd,
          model: modelSelection.model,
          modelProvider: null,
          approvalPolicy: "on-failure",
          sandbox: "workspace-write",
          config: null,
          baseInstructions: null,
          developerInstructions: null,
          personality: null,
          ephemeral: false,
          experimentalRawEvents: false,
        })
        threadId = threadStart?.thread?.id ?? null
        await sink.setProviderIds({ providerThreadId: threadId })
      }

      const startTurn = async () => {
        const turnStart = await client.request("turn/start", {
          threadId,
          input: [{ type: "text", text: promptContext.prompt, text_elements: [] }],
          cwd: input.cwd,
          approvalPolicy: "on-failure",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [input.cwd],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
          model: modelSelection.model,
          effort: modelSelection.effort,
          summary: "auto",
          personality: null,
          outputSchema: null,
          collaborationMode: null,
        })
        turnId = turnStart?.turn?.id ?? turnId
        await sink.setProviderIds({ providerThreadId: threadId, providerTurnId: turnId })
      }

      if (!threadId) {
        await startThread()
      }

      try {
        await startTurn()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!input.thread.providerThreadId || !isCodexAppServerThreadNotFoundError(message)) {
          throw error
        }

        await sink.emit({
          type: "status",
          payload: {
            status: "running",
            recovery: "codex_thread_recreated",
            previousProviderThreadId: input.thread.providerThreadId,
          },
        })
        threadId = null
        turnId = null
        await sink.setProviderIds({ providerThreadId: null, providerTurnId: null })
        await startThread()
        await startTurn()
      }

      await runPromise
      offRequest()
      return {
        summary: summary.trim() || "Codex finished this run.",
        providerThreadId: threadId,
        providerTurnId: turnId,
      }
    } finally {
      activeClients.delete(input.run.id)
      await client.stop()
    }
  }

  async cancel(runId: string): Promise<void> {
    const client = activeClients.get(runId)
    if (!client) return
    await client.stop()
  }
}
