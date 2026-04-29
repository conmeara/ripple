import type {
  AgentConnection,
  AgentRun,
  AgentRunEvent,
  AgentThread,
  Workspace,
} from "../db"

export type AgentProviderId = "codex" | "claude" | "fake"

export type AgentRuntimeId =
  | "codex_app_server"
  | "claude_agent_sdk"
  | "fake"

export type AgentRunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "awaiting_approval"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"
  | "recoverable"

export type AgentRunEventType =
  | "status"
  | "assistant_text_delta"
  | "assistant_message"
  | "reasoning"
  | "tool_start"
  | "tool_update"
  | "tool_end"
  | "file_change"
  | "approval_request"
  | "usage"
  | "error"

export type AgentRunKind = "chat" | "generated_change"
export type AgentRunMode = "plan" | "agent"
export type WorkspaceKind = "main" | "chat_worktree" | "generated_change"

export type AgentWorkspaceTarget =
  | { type: "project"; projectId: string }
  | { type: "chat"; chatId: string }
  | { type: "revision"; revisionId: string }

export interface ProviderAuthStatus {
  provider: AgentProviderId
  runtime: AgentRuntimeId
  connected: boolean
  authMode: string | null
  label: string
  safeAccount?: Record<string, unknown>
  setupAction?: "codex_login" | "claude_login" | "api_key" | "none"
}

export interface AgentRunEventInput {
  type: AgentRunEventType
  payload?: Record<string, unknown>
  providerType?: string | null
  providerId?: string | null
}

export interface AgentRunExecutionContext {
  run: AgentRun
  thread: AgentThread
  workspace: Workspace
  connection: AgentConnection
}

export interface AgentProviderRunInput extends AgentRunExecutionContext {
  prompt: string
  cwd: string
  mode: AgentRunMode
  model: string | null
  authConfig?: {
    apiKey?: string
  } | null
}

export interface AgentProviderRunResult {
  summary: string | null
  providerThreadId?: string | null
  providerTurnId?: string | null
  providerSessionId?: string | null
  usage?: Record<string, unknown> | null
}

export interface AgentProviderEventSink {
  emit(event: AgentRunEventInput): Promise<AgentRunEvent>
  setProviderIds(ids: {
    providerThreadId?: string | null
    providerTurnId?: string | null
    providerSessionId?: string | null
    providerItemId?: string | null
  }): Promise<void>
  isCancellationRequested(): boolean
}

export interface AgentProviderAdapter {
  readonly provider: AgentProviderId
  readonly runtime: AgentRuntimeId
  checkAuth(): Promise<ProviderAuthStatus>
  run(
    input: AgentProviderRunInput,
    sink: AgentProviderEventSink,
  ): Promise<AgentProviderRunResult>
  cancel?(runId: string): Promise<void>
}

export interface StartAgentRunInput {
  target: AgentWorkspaceTarget
  provider: AgentProviderId
  prompt: string
  requestId: string
  runKind: AgentRunKind
  mode?: AgentRunMode
  model?: string | null
  chatId?: string | null
  subChatId?: string | null
  commentThreadId?: string | null
  revisionId?: string | null
}

export interface StartAgentRunResult {
  run: AgentRun
  thread: AgentThread
  workspace: Workspace
  connection: AgentConnection
  reused: boolean
}

export const ACTIVE_AGENT_RUN_STATUSES: readonly AgentRunStatus[] = [
  "queued",
  "preparing",
  "running",
  "awaiting_approval",
  "cancelling",
]

export function isActiveAgentRunStatus(status: string | null | undefined): boolean {
  return ACTIVE_AGENT_RUN_STATUSES.includes(status as AgentRunStatus)
}
