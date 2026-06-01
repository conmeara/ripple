import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { app } from "electron"
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
  buildProjectNoteFallbackInstructions,
  ensureProjectAppManagedAgentSkills,
  resolveAgentRunContext,
} from "../agent-run-context-resolver"
import {
  resolveCodexMcpSnapshot,
  type CodexMcpSnapshot,
} from "../../trpc/routers/codex"
import { prepareAgentRuntimePrompt } from "../prompt-mentions"
import {
  prepareRuntimeAttachments,
} from "../runtime-attachments"
import { getBundledCodexCliPath } from "./bundled-binaries"
import {
  extractItemText,
  getCodexAppServerErrorMessage,
  isCodexAppServerThreadNotFoundError,
  isTurnComplete,
  normalizeCodexAppServerNotification,
  type JsonRpcMessage,
} from "./codex-app-server-events"
import {
  buildCodexAppServerArgs,
  buildCodexAppServerEnv,
  buildCodexShellEnvironmentPolicyConfig,
} from "./codex-app-server-env"
import { buildCodexTurnInput, type CodexUserInput } from "./codex-app-server-input"
import {
  buildCodexTurnSkillInputs,
  normalizeCodexSkillEntries,
  type CodexSkillMetadata,
} from "./codex-app-server-skills"
import { normalizeCodexModelSelection } from "./codex-model-selection"
import { buildRippleAgentToolEnvironment } from "../cli-tools-env"
import { createAgentVisualContextEndpoint } from "../visual-context-endpoint"
import { createAgentVisualContextFileBridge } from "../visual-context-file-bridge"
import {
  buildCodexNativeVisualContextContentItems,
  buildRippleVisualDynamicToolSpecs,
  isRippleVisualDynamicToolCall,
  runNativeVisualContextTool,
} from "../visual-context-native-tool"
import {
  approvalBoundaryWarning,
  assessCodexAppServerApprovalRequest,
  buildCodexPermissionApprovalResponse,
  isCodexAppServerAutoApprovedVisualCommand,
  isCodexAppServerProjectLocalAutoApprovedRequest,
} from "./codex-app-server-approval"

function getRepoRoot(): string | undefined {
  return app.isPackaged ? undefined : app.getAppPath()
}

const activeClients = new Map<string, {
  client: CodexAppServerClient
  cancel: () => void
}>()

function buildAppManagedCodexThreadConfig(env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    suppress_unstable_features_warning: true,
    shell_environment_policy: buildCodexShellEnvironmentPolicyConfig(env),
  }
}

class CodexRunCancelledError extends Error {
  constructor() {
    super("Run cancelled.")
    this.name = "CodexRunCancelledError"
  }
}

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

async function resolveCodexSkills(input: {
  client: CodexAppServerClient
  cwd: string
  projectPath: string
  appManagedSkillRoots: string[]
}): Promise<CodexSkillMetadata[]> {
  const cwds = Array.from(new Set([input.projectPath, input.cwd]))
  const response = await input.client.request("skills/list", {
    cwds,
    forceReload: false,
    perCwdExtraUserRoots: cwds.map((cwd) => ({
      cwd,
      extraUserRoots: input.appManagedSkillRoots,
    })),
  })
  return normalizeCodexSkillEntries(response)
}

function formatCodexCapabilityLabel(input: {
  mcpServerNames: string[]
  unavailableMcpServerNames: string[]
  skillNames: string[]
  appPolicyLoaded: boolean
  projectNoteStatus: string | null
  hasMentions: boolean
}): string | null {
  const parts: string[] = []
  if (input.mcpServerNames.length > 0) {
    parts.push(`${input.mcpServerNames.length} MCP server${input.mcpServerNames.length === 1 ? "" : "s"}`)
  }
  if (input.unavailableMcpServerNames.length > 0) {
    parts.push(`${input.unavailableMcpServerNames.length} MCP unavailable`)
  }
  if (input.skillNames.length > 0) {
    parts.push(`${input.skillNames.length} skill${input.skillNames.length === 1 ? "" : "s"}`)
  }
  if (input.appPolicyLoaded) {
    parts.push("Ripple policy")
  }
  if (input.projectNoteStatus) {
    parts.push(input.projectNoteStatus)
  }
  if (input.hasMentions) {
    parts.push("prompt context")
  }
  return parts.length > 0 ? `Loaded Codex context: ${parts.join(", ")}` : null
}

function isLikelySkillInputError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\bskill\b/i.test(message)
}

function collectApprovalPaths(value: unknown): string[] {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectApprovalPaths(item))
  }

  const paths: string[] = []
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase()
    if (
      typeof nested === "string" &&
      (
        normalizedKey === "cwd" ||
        normalizedKey === "path" ||
        normalizedKey === "filepath" ||
        normalizedKey === "file_path" ||
        normalizedKey === "absolutepath" ||
        normalizedKey === "absolute_path"
      )
    ) {
      paths.push(nested)
      continue
    }
    paths.push(...collectApprovalPaths(nested))
  }
  return paths
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
    private readonly args: string[] = ["app-server"],
  ) {}

  async start(): Promise<void> {
    if (this.child) return
    this.child = spawn(this.binaryPath, this.args, {
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
    child.on("close", (code, signal) => {
      if (this.child === child) {
        this.child = null
      }
      const message = signal
        ? `Codex App Server stopped (${signal}).`
        : `Codex App Server stopped${typeof code === "number" ? ` with code ${code}` : ""}.`
      for (const pending of this.pending.values()) {
        pending.reject(new Error(message))
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
        name: "ripple_desktop",
        title: "Ripple",
        version: app.getVersion(),
      },
      capabilities: {
        experimentalApi: true,
      },
    })
    this.notify("initialized")
  }

  async stop(): Promise<void> {
    if (!this.child) return
    const child = this.child
    this.child = null
    child.kill()
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex App Server stopped."))
    }
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

  notify(method: string, params?: any): void {
    this.child?.stdin.write(`${JSON.stringify({ method, params })}\n`)
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
    const repoRoot = getRepoRoot()
    const [visualContextEndpoint, visualContextBridge] = await Promise.all([
      createAgentVisualContextEndpoint(input.cwd, {
        resolveCurrentFrameSnapshot: async () => input.currentFrameSnapshot ?? null,
      }),
      createAgentVisualContextFileBridge(input.cwd, {
        runId: input.run.id,
        resolveCurrentFrameSnapshot: async () => input.currentFrameSnapshot ?? null,
        prewarmCurrentFrameSnapshot: input.currentFrameSnapshot ?? null,
      }),
    ])
    const appServerEnv = buildRippleAgentToolEnvironment({
      baseEnv: buildCodexAppServerEnv(appManagedApiKey),
      repoRoot,
      workspaceRoot: input.cwd,
      visualContextEndpoint: visualContextEndpoint?.endpoint,
      visualContextToken: visualContextEndpoint?.token,
      visualContextBridgeDir: visualContextBridge?.requestDir,
      visualContextBridgeToken: visualContextBridge?.token,
    })
    const client = new CodexAppServerClient(
      getBundledCodexCliPath(),
      appServerEnv,
      buildCodexAppServerArgs(appServerEnv),
    )
    let cancelled = false
    let rejectRunPromise: ((error: Error) => void) | null = null
    const cancelRun = () => {
      if (cancelled) return
      cancelled = true
      rejectRunPromise?.(new CodexRunCancelledError())
      void client.stop()
    }
    activeClients.set(input.run.id, { client, cancel: cancelRun })
    let summary = ""
    // Ripple owns the product transcript in SQLite. Do not resume provider-side
    // Codex threads here: the app-server can replay unrelated local Codex
    // history if a stored provider thread id points at a different workspace.
    let threadId: string | null = null
    let turnId: string | null = null
    const modelSelection = normalizeCodexModelSelection(input.model)

    try {
      await client.start()
      const account = await client.request("account/read", {})
      if (!account?.account && !appManagedApiKey) {
        throw new Error("Connect Codex before asking it to edit.")
      }

      let codexMcpSnapshot: CodexMcpSnapshot | null = null
      try {
        const resolvedProjectPath = input.projectPath || resolveProjectPathFromWorktree(input.cwd)
        codexMcpSnapshot = await resolveCodexMcpSnapshot({
          lookupPath: resolvedProjectPath || input.cwd,
        })
      } catch (error) {
        console.warn("[codex-app-server] Failed to resolve Codex MCP context:", error)
      }

      await ensureProjectAppManagedAgentSkills({
        provider: "codex",
        projectPath: input.projectPath,
      })
      const runContext = await resolveAgentRunContext({
        provider: "codex",
        cwd: input.cwd,
        projectPath: input.projectPath,
        workspaceKind: input.workspaceKind,
      })
      const projectNoteFallback = buildProjectNoteFallbackInstructions(runContext)
      let codexSkills: CodexSkillMetadata[] = []
      let codexSkillsError: string | null = null
      try {
        codexSkills = await resolveCodexSkills({
          client,
          cwd: input.cwd,
          projectPath: input.projectPath,
          appManagedSkillRoots: runContext.skillRoots.appManaged,
        })
      } catch (error) {
        codexSkillsError = error instanceof Error ? error.message : String(error)
        console.warn("[codex-app-server] Failed to resolve Codex skills:", error)
      }

      const preparedAttachments = await prepareRuntimeAttachments({
        runId: input.run.id,
        cwd: input.cwd,
        attachments: input.attachments,
      })
      const promptContext = prepareAgentRuntimePrompt(input.prompt)
      const finalPrompt = [
        promptContext.prompt,
        preparedAttachments.promptSuffix,
      ].filter(Boolean).join("\n\n")

      const codexSessionInit = buildCodexMcpSessionInit(codexMcpSnapshot)
      const visualDynamicTools = buildRippleVisualDynamicToolSpecs()
      const codexSkillNames = codexSkills
        .filter((skill) => skill.enabled)
        .map((skill) => skill.name)
        .sort()
      const codexSkillInputs = buildCodexTurnSkillInputs(promptContext.skillMentions, codexSkills)
      const hasPromptMentions =
        promptContext.agentMentions.length > 0 ||
        promptContext.skillMentions.length > 0 ||
        promptContext.toolMentions.length > 0
      const capabilityLabel = formatCodexCapabilityLabel({
        mcpServerNames: codexSessionInit.mcpServerNames,
        unavailableMcpServerNames: codexSessionInit.unavailableMcpServerNames,
        skillNames: codexSkillNames,
        appPolicyLoaded: true,
        projectNoteStatus: runContext.projectNotes.discoveryStatus === "missing"
          ? null
          : `${runContext.projectNotes.fileName} ${runContext.projectNotes.discoveryStatus}`,
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
              appPolicy: "developerInstructions",
              projectNoteFile: runContext.projectNotes.fileName,
              projectNoteStatus: runContext.projectNotes.discoveryStatus,
              projectNoteNativePath: runContext.projectNotes.nativePath,
              projectNoteFallbackPath: runContext.projectNotes.fallbackPath,
              appManagedSkillRoots: runContext.skillRoots.appManaged,
              mcpServers: codexSessionInit.mcpServerNames,
              unavailableMcpServers: codexSessionInit.unavailableMcpServerNames,
              skills: codexSkillNames,
              unavailableSkills: promptContext.skillMentions.filter(
                (mention) => !codexSkillInputs.some((skill) =>
                  skill.name.toLowerCase() === mention.toLowerCase()
                ),
              ),
              skillsError: codexSkillsError,
            },
            sessionInit: {
              tools: [
                ...codexSessionInit.tools,
                ...visualDynamicTools.map((tool) => `${tool.namespace}.${tool.name}`),
              ],
              mcpServers: codexSessionInit.mcpServers,
              plugins: [],
              skills: codexSkillNames,
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
          const providerRequestId = String(message.id)
          const cwd = message.params?.cwd
          const assessment = assessCodexAppServerApprovalRequest({
            params: message.params,
            workspaceRoot: input.cwd,
          })
          if (isCodexAppServerAutoApprovedVisualCommand({
            params: message.params,
            workspaceRoot: input.cwd,
            assessment,
          }) || isCodexAppServerProjectLocalAutoApprovedRequest({
            params: message.params,
            workspaceRoot: input.cwd,
            assessment,
          })) {
            return assessment.approveResponse
          }
          const approval = await sink.requestApproval({
            providerRequestId,
            kind: assessment.requestedNetwork ? "network" : "command",
            prompt: String(message.params?.reason ?? message.params?.command ?? "Command approval"),
            details: {
              providerName: "Codex",
              command: message.params?.command,
              cwd,
              reason: message.params?.reason,
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              approvalId: message.params?.approvalId,
              availableDecisions: message.params?.availableDecisions,
              networkApprovalContext: message.params?.networkApprovalContext,
              additionalPermissions: message.params?.additionalPermissions,
              proposedExecpolicyAmendment: message.params?.proposedExecpolicyAmendment,
              proposedNetworkPolicyAmendments: message.params?.proposedNetworkPolicyAmendments,
              requestedNetwork: assessment.requestedNetwork,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              unsupportedPermissionReferences: assessment.unsupportedPermissionReferences,
              approvalWarning: assessment.approvalWarning,
              canApprove: assessment.canApprove,
            },
            providerType: message.method,
            providerId: providerRequestId,
            payload: {
              providerName: "Codex",
              kind: assessment.requestedNetwork ? "network" : "command",
              command: message.params?.command,
              cwd,
              reason: message.params?.reason,
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              approvalId: message.params?.approvalId,
              availableDecisions: message.params?.availableDecisions,
              networkApprovalContext: message.params?.networkApprovalContext,
              additionalPermissions: message.params?.additionalPermissions,
              requestedNetwork: assessment.requestedNetwork,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              decision: "pending",
              approvalWarning: assessment.approvalWarning,
              canApprove: assessment.canApprove,
            },
          })
          return approval.approved && assessment.canApprove
            ? assessment.approveResponse
            : {
              ...assessment.denyResponse,
              reason: approval.message ?? "Denied by user.",
            }
        }
        if (message.method === "item/fileChange/requestApproval") {
          const providerRequestId = String(message.id)
          const paths = collectApprovalPaths(message.params)
          const pathApprovalWarning = approvalBoundaryWarning(paths, input.cwd)
          const assessment = assessCodexAppServerApprovalRequest({
            params: message.params,
            workspaceRoot: input.cwd,
          })
          const approvalWarning = pathApprovalWarning ?? assessment.approvalWarning
          if (isCodexAppServerProjectLocalAutoApprovedRequest({
            params: message.params,
            workspaceRoot: input.cwd,
            assessment: {
              ...assessment,
              approvalWarning,
            },
            paths,
          })) {
            return assessment.approveResponse
          }
          const approval = await sink.requestApproval({
            providerRequestId,
            kind: "file_change",
            prompt: "File change approval",
            details: {
              providerName: "Codex",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              approvalId: message.params?.approvalId,
              availableDecisions: message.params?.availableDecisions,
              paths,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              approvalWarning,
              canApprove: assessment.canApprove,
            },
            providerType: message.method,
            providerId: providerRequestId,
            payload: {
              providerName: "Codex",
              kind: "file_change",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              approvalId: message.params?.approvalId,
              paths,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              decision: "pending",
              approvalWarning,
              canApprove: assessment.canApprove,
            },
          })
          return approval.approved && assessment.canApprove
            ? assessment.approveResponse
            : {
              ...assessment.denyResponse,
              reason: approval.message ?? "Denied by user.",
            }
        }
        if (message.method === "item/permissions/requestApproval") {
          const providerRequestId = String(message.id)
          const assessment = assessCodexAppServerApprovalRequest({
            params: message.params,
            workspaceRoot: input.cwd,
          })
          if (isCodexAppServerProjectLocalAutoApprovedRequest({
            params: message.params,
            workspaceRoot: input.cwd,
            assessment,
          })) {
            return buildCodexPermissionApprovalResponse({
              params: message.params,
              approved: true,
            })
          }
          const approval = await sink.requestApproval({
            providerRequestId,
            kind: assessment.requestedNetwork ? "network" : "file_change",
            prompt: String(message.params?.reason ?? "Permission approval"),
            details: {
              providerName: "Codex",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              cwd: message.params?.cwd,
              reason: message.params?.reason,
              permissions: message.params?.permissions,
              requestedNetwork: assessment.requestedNetwork,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              unsupportedPermissionReferences: assessment.unsupportedPermissionReferences,
              approvalWarning: assessment.approvalWarning,
            },
            providerType: message.method,
            providerId: providerRequestId,
            payload: {
              providerName: "Codex",
              kind: assessment.requestedNetwork ? "network" : "permission",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              cwd: message.params?.cwd,
              reason: message.params?.reason,
              permissions: message.params?.permissions,
              requestedNetwork: assessment.requestedNetwork,
              requestedPermissionPaths: assessment.requestedPermissionPaths,
              decision: "pending",
              approvalWarning: assessment.approvalWarning,
              canApprove: true,
            },
          })
          return buildCodexPermissionApprovalResponse({
            params: message.params,
            approved: approval.approved,
          })
        }
        if (message.method === "item/tool/requestUserInput") {
          const providerRequestId = String(message.id)
          const approval = await sink.requestApproval({
            providerRequestId,
            kind: "question",
            prompt: "Codex asked for input.",
            details: {
              providerName: "Codex",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              questions: message.params?.questions,
            },
            providerType: message.method,
            providerId: providerRequestId,
            payload: {
              providerName: "Codex",
              kind: "user_input",
              threadId: message.params?.threadId,
              turnId: message.params?.turnId,
              itemId: message.params?.itemId,
              questions: message.params?.questions,
              decision: "pending",
              canApprove: true,
            },
          })
          return approval.approved && approval.response
            ? approval.response
            : { answers: {} }
        }
        if (message.method === "item/tool/call") {
          const callId = String(message.params?.callId ?? message.id)
          const toolName = message.params?.tool ?? "Tool"
          await sink.emit({
            type: "tool_start",
            providerType: message.method,
            providerId: callId,
            payload: {
              toolCallId: callId,
              toolName,
              arguments: message.params?.arguments,
            },
          })
          if (isRippleVisualDynamicToolCall({
            namespace: message.params?.namespace,
            tool: message.params?.tool,
          })) {
            try {
              const result = await runNativeVisualContextTool({
                cwd: input.cwd,
                env: appServerEnv,
                repoRoot,
                tool: message.params?.tool,
                arguments: message.params?.arguments,
              })
              await sink.emit({
                type: "tool_end",
                providerType: message.method,
                providerId: callId,
                payload: {
                  toolCallId: callId,
                  toolName,
                  status: "completed",
                  output: {
                    artifactPath: result.relativePath,
                    type: result.kind,
                    payload: result.payload,
                    byteLength: result.byteLength,
                  },
                },
              })
              return {
                success: true,
                contentItems: buildCodexNativeVisualContextContentItems(result),
              }
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error)
              await sink.emit({
                type: "tool_end",
                providerType: message.method,
                providerId: callId,
                payload: {
                  toolCallId: callId,
                  toolName,
                  status: "failed",
                  error: messageText,
                },
              })
              return {
                success: false,
                contentItems: [
                  {
                    type: "inputText",
                    text: `Ripple visual context failed: ${messageText}`,
                  },
                ],
              }
            }
          }
          await sink.emit({
            type: "tool_end",
            providerType: message.method,
            providerId: callId,
            payload: {
              toolCallId: callId,
              toolName,
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
        rejectRunPromise = reject
        const off = client.onNotification((message) => {
          void (async () => {
            try {
              if (cancelled || sink.isCancellationRequested()) {
                off()
                reject(new CodexRunCancelledError())
                return
              }
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

      const threadInstructionParams = () => ({
        baseInstructions: projectNoteFallback,
        developerInstructions: runContext.appPolicy,
      })

      const startThread = async () => {
        if (cancelled || sink.isCancellationRequested()) throw new CodexRunCancelledError()
        const threadStart = await client.request("thread/start", {
          cwd: input.cwd,
          serviceName: "ripple_desktop",
          model: modelSelection.model,
          modelProvider: null,
          approvalPolicy: "on-request",
          sandbox: "workspace-write",
          config: buildAppManagedCodexThreadConfig(appServerEnv),
          ...threadInstructionParams(),
          personality: null,
          ephemeral: true,
          sessionStartSource: "clear",
          experimentalRawEvents: false,
          persistExtendedHistory: false,
          dynamicTools: visualDynamicTools,
        })
        threadId = threadStart?.thread?.id ?? null
        await sink.setProviderIds({ providerThreadId: threadId })
      }

      const startTurn = async (
        skillInputs: Array<Extract<CodexUserInput, { type: "skill" }>>,
      ) => {
        if (cancelled || sink.isCancellationRequested()) throw new CodexRunCancelledError()
        const turnStart = await client.request("turn/start", {
          threadId,
          input: buildCodexTurnInput(finalPrompt, preparedAttachments, skillInputs),
          cwd: input.cwd,
          approvalPolicy: "on-request",
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

      const startTurnWithSkillFallback = async () => {
        try {
          await startTurn(codexSkillInputs)
        } catch (error) {
          if (codexSkillInputs.length === 0 || !isLikelySkillInputError(error)) {
            throw error
          }
          await sink.emit({
            type: "status",
            providerType: "codex:skills",
            providerId: input.run.id,
            payload: {
              status: "running",
              label: "Codex skill input unavailable; continuing with prompt context",
              fallback: "typed_skill_input",
              skills: codexSkillInputs.map((skill) => skill.name),
            },
          })
          await startTurn([])
        }
      }

      await startThread()

      try {
        await startTurnWithSkillFallback()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!isCodexAppServerThreadNotFoundError(message)) {
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
        await startTurnWithSkillFallback()
      }

      await runPromise
      if (cancelled || sink.isCancellationRequested()) {
        throw new CodexRunCancelledError()
      }
      offRequest()
      return {
        summary: summary.trim() || "Codex finished this run.",
        providerThreadId: threadId,
        providerTurnId: turnId,
      }
    } finally {
      activeClients.delete(input.run.id)
      await visualContextBridge?.close()
      await visualContextEndpoint?.close()
      await client.stop()
    }
  }

  async cancel(runId: string): Promise<void> {
    const active = activeClients.get(runId)
    if (!active) return
    active.cancel()
  }
}
