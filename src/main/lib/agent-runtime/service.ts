import { EventEmitter } from "node:events"
import { and, desc, eq, inArray } from "drizzle-orm"
import { buildAgentRuntimeAssistantProjection } from "../../../shared/agent-runtime-ui-projection"
import { appendOptionalAgentRuntimeAttachments } from "../../../shared/agent-runtime-attachments"
import {
  agentConnections,
  agentApprovals,
  agentRunEvents,
  agentRuns,
  agentThreads,
  conversations,
  getDatabase,
  revisions,
  type AgentRun,
  type AgentRunEvent,
  type AgentThread,
} from "../db"
import { ensureDefaultAgentConnection } from "./connection-registry"
import { createAgentProviderAdapter } from "./provider-factory"
import {
  recordRunAssistantProjection,
  recordRunUserPromptProjection,
} from "./transcript-projection"
import { buildConversationHistoryContext } from "./chat-history-context"
import {
  appendRuntimeContextToPrompt,
  buildAgentRuntimeContextPrompt,
  parseAgentRuntimeContextPayload,
  resolveAgentRuntimeCurrentFrameSnapshot,
  serializeAgentRuntimeContextPayload,
} from "./run-editor-context"
import {
  isActiveAgentRunStatus,
  type AgentRuntimeAttachment,
  type AgentProviderEventSink,
  type AgentProviderApprovalDecision,
  type AgentProviderApprovalRequestInput,
  type AgentRunEventRefs,
  type AgentRunEventInput,
  type ProviderAuthStatus,
  type StartAgentRunInput,
  type StartAgentRunResult,
} from "./types"
import { resolveAgentWorkspaceContext } from "./workspace-context"
import { resolveCommentVisualAttachmentsForRun } from "../revisions/comment-visuals"

type Db = ReturnType<typeof getDatabase>
type AgentRunEventListener = (event: AgentRunEvent) => void
const ALL_AGENT_RUN_EVENTS = "__all_agent_run_events__"
class AgentRunCancelledError extends Error {
  constructor() {
    super("Run cancelled.")
    this.name = "AgentRunCancelledError"
  }
}

const agentRunEventBus = new EventEmitter()
agentRunEventBus.setMaxListeners(0)

const pendingAgentApprovals = new Map<
  string,
  {
    runId: string
    resolve: (decision: AgentProviderApprovalDecision) => void
  }
>()

function activeStatuses() {
  return ["queued", "preparing", "running", "awaiting_approval", "cancelling"] as const
}

function setConversationStreamForRun(
  db: Db,
  run: Pick<AgentRun, "id" | "conversationId" | "runKind">,
): void {
  if (run.runKind !== "chat" || !run.conversationId) return
  db.update(conversations)
    .set({
      streamId: run.id,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, run.conversationId))
    .run()
}

function clearConversationStreamForRun(
  db: Db,
  run: Pick<AgentRun, "id" | "conversationId" | "runKind">,
): void {
  if (run.runKind !== "chat" || !run.conversationId) return
  db.update(conversations)
    .set({
      streamId: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(conversations.id, run.conversationId),
      eq(conversations.streamId, run.id),
    ))
    .run()
}

function getNextEventSequence(db: Db, runId: string): number {
  const last = db
    .select({ sequence: agentRunEvents.sequence })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.agentRunId, runId))
    .orderBy(desc(agentRunEvents.sequence))
    .get()
  return (last?.sequence ?? 0) + 1
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

const RAW_PROVIDER_PAYLOAD_STRING_LIMIT = 500
const RAW_PROVIDER_PAYLOAD_ARRAY_LIMIT = 8
const RAW_PROVIDER_PAYLOAD_OBJECT_KEY_LIMIT = 24
const RAW_PROVIDER_PAYLOAD_DEPTH_LIMIT = 2
const RAW_PROVIDER_PAYLOAD_OMITTED_KEYS = new Set([
  "attachments",
  "content",
  "data",
  "diff",
  "image",
  "images",
  "output",
  "payloadJson",
  "providerRefs",
  "result",
])

function describeRawProviderValue(value: unknown): string {
  if (typeof value === "string") return `${value.length} chars`
  if (Array.isArray(value)) return `${value.length} items`
  if (value && typeof value === "object") return "object"
  return typeof value
}

function compactRawProviderPayload(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") {
    return value.length > RAW_PROVIDER_PAYLOAD_STRING_LIMIT
      ? `${value.slice(0, RAW_PROVIDER_PAYLOAD_STRING_LIMIT)}...[truncated ${value.length - RAW_PROVIDER_PAYLOAD_STRING_LIMIT} chars]`
      : value
  }
  if (Array.isArray(value)) {
    if (depth >= RAW_PROVIDER_PAYLOAD_DEPTH_LIMIT) return `[${value.length} items]`
    const items = value
      .slice(0, RAW_PROVIDER_PAYLOAD_ARRAY_LIMIT)
      .map((item) => compactRawProviderPayload(item, depth + 1))
    if (value.length > RAW_PROVIDER_PAYLOAD_ARRAY_LIMIT) {
      items.push(`[${value.length - RAW_PROVIDER_PAYLOAD_ARRAY_LIMIT} more items]`)
    }
    return items
  }
  if (!value || typeof value !== "object") return jsonSafe(value)
  if (depth >= RAW_PROVIDER_PAYLOAD_DEPTH_LIMIT) return "[object]"

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(
    0,
    RAW_PROVIDER_PAYLOAD_OBJECT_KEY_LIMIT,
  )) {
    if (RAW_PROVIDER_PAYLOAD_OMITTED_KEYS.has(key)) {
      output[key] = `[omitted ${describeRawProviderValue(child)}]`
      continue
    }
    output[key] = compactRawProviderPayload(child, depth + 1)
  }
  const extraKeys = Object.keys(value as Record<string, unknown>).length - RAW_PROVIDER_PAYLOAD_OBJECT_KEY_LIMIT
  if (extraKeys > 0) output.__truncatedKeys = extraKeys
  return jsonSafe(output)
}

function compactString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function refsFromPayload(payload: Record<string, unknown>): Partial<AgentRunEventRefs> {
  const turn = payload.turn && typeof payload.turn === "object"
    ? payload.turn as Record<string, unknown>
    : null
  return {
    turnId:
      compactString(payload.turnId) ??
      compactString(payload.providerTurnId) ??
      compactString(turn?.id) ??
      null,
    itemId:
      compactString(payload.itemId) ??
      compactString(payload.toolCallId) ??
      compactString(payload.tool_use_id) ??
      compactString(payload.callId) ??
      null,
    requestId: compactString(payload.requestId) ?? null,
  }
}

function buildRunEventRefs(input: {
  db: Db
  runId: string
  event: AgentRunEventInput
  createdAt: Date
}): AgentRunEventRefs {
  const payload = input.event.payload ?? {}
  const run = input.db
    .select({
      provider: agentRuns.provider,
      requestId: agentRuns.requestId,
      providerTurnId: agentRuns.providerTurnId,
      providerItemId: agentRuns.providerItemId,
    })
    .from(agentRuns)
    .where(eq(agentRuns.id, input.runId))
    .get()
  const payloadRefs = refsFromPayload(payload)
  return {
    ...(input.event.refs ?? {}),
    createdAt: input.createdAt.toISOString(),
    provider: input.event.refs?.provider ?? run?.provider ?? null,
    runId: input.runId,
    requestId:
      input.event.refs?.requestId ??
      payloadRefs.requestId ??
      run?.requestId ??
      null,
    turnId:
      input.event.refs?.turnId ??
      payloadRefs.turnId ??
      run?.providerTurnId ??
      null,
    itemId:
      input.event.refs?.itemId ??
      payloadRefs.itemId ??
      run?.providerItemId ??
      input.event.providerId ??
      null,
    providerId: input.event.providerId ?? input.event.refs?.providerId ?? null,
    providerType: input.event.providerType ?? input.event.refs?.providerType ?? null,
    rawProviderMethod:
      input.event.refs?.rawProviderMethod ??
      input.event.providerType ??
      input.event.type,
    ...(input.event.refs?.rawPayload !== undefined
      ? { rawPayload: compactRawProviderPayload(input.event.refs.rawPayload) }
      : {}),
  }
}

function insertRunEvent(
  db: Db,
  runId: string,
  event: AgentRunEventInput,
): AgentRunEvent {
  const createdAt = new Date()
  const providerRefs = buildRunEventRefs({ db, runId, event, createdAt })
  const inserted = db
    .insert(agentRunEvents)
    .values({
      agentRunId: runId,
      sequence: getNextEventSequence(db, runId),
      type: event.type,
      providerType: event.providerType ?? null,
      providerId: event.providerId ?? null,
      payloadJson: JSON.stringify({
        ...(event.payload ?? {}),
        providerRefs,
      }),
      createdAt,
    })
    .returning()
    .get()
  agentRunEventBus.emit(runId, inserted)
  agentRunEventBus.emit(ALL_AGENT_RUN_EVENTS, inserted)
  return inserted
}

export function subscribeToAgentRunEvents(
  runId: string,
  listener: AgentRunEventListener,
): () => void {
  agentRunEventBus.on(runId, listener)
  return () => agentRunEventBus.off(runId, listener)
}

export function subscribeToAllAgentRunEvents(
  listener: AgentRunEventListener,
): () => void {
  agentRunEventBus.on(ALL_AGENT_RUN_EVENTS, listener)
  return () => agentRunEventBus.off(ALL_AGENT_RUN_EVENTS, listener)
}

function requireRunContext(db: Db, runId: string) {
  const row = db
    .select({
      run: agentRuns,
      thread: agentThreads,
    })
    .from(agentRuns)
    .innerJoin(agentThreads, eq(agentThreads.id, agentRuns.agentThreadId))
    .where(eq(agentRuns.id, runId))
    .get()
  if (!row) throw new Error("Agent run not found.")

  const resolved = resolveAgentWorkspaceContext(
    row.run.revisionId
      ? { type: "revision", revisionId: row.run.revisionId }
      : row.run.conversationId
        ? { type: "conversation", conversationId: row.run.conversationId }
      : row.run.chatId
        ? { type: "chat", chatId: row.run.chatId }
        : { type: "project", projectId: row.thread.projectId },
    db,
  )
  const workspace = resolved.workspace
  const connection = db
    .select()
    .from(agentConnections)
    .where(eq(agentConnections.id, row.run.connectionId))
    .get()
  if (!connection) {
    throw new Error("Agent connection not found for this run.")
  }
  if (connection.provider !== row.run.provider) {
    throw new Error("Agent connection does not match this run provider.")
  }
  return {
    run: row.run,
    thread: row.thread,
    workspace,
    connection,
    project: resolved.project,
    projectPath: resolved.projectPath,
    writableRoot: resolved.writableRoot,
    workspaceKind: resolved.kind,
    targetType: resolved.targetType,
    targetId: resolved.targetId,
  }
}

function isCancellationRequested(db: Db, runId: string): boolean {
  const run = db
    .select({ status: agentRuns.status, cancelRequestedAt: agentRuns.cancelRequestedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get()
  return Boolean(
    run?.cancelRequestedAt ||
      run?.status === "cancelling" ||
      run?.status === "cancelled",
  )
}

async function requestAgentRunApproval(input: {
  db: Db
  runId: string
  request: AgentProviderApprovalRequestInput
  onEvent?: (event: AgentRunEvent) => void | Promise<void>
}): Promise<AgentProviderApprovalDecision> {
  const now = new Date()
  const approval = input.db
    .insert(agentApprovals)
    .values({
      agentRunId: input.runId,
      providerRequestId: input.request.providerRequestId,
      kind: input.request.kind,
      status: "pending",
      prompt: input.request.prompt,
      detailsJson: JSON.stringify(input.request.details ?? {}),
      responseJson: null,
      createdAt: now,
      resolvedAt: null,
    })
    .returning()
    .get()

  input.db
    .update(agentRuns)
    .set({
      status: "awaiting_approval",
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(agentRuns.id, input.runId))
    .run()

  const statusEvent = insertRunEvent(input.db, input.runId, {
    type: "status",
    payload: {
      status: "awaiting_approval",
      approvalId: approval.id,
    },
  })
  await input.onEvent?.(statusEvent)

  const userInputEvent = insertRunEvent(input.db, input.runId, {
    type: "user-input.requested",
    providerType: input.request.providerType ?? "ripple:approval",
    providerId: input.request.providerId ?? input.request.providerRequestId,
    refs: {
      itemId: input.request.providerId ?? input.request.providerRequestId,
    },
    payload: {
      approvalId: approval.id,
      providerRequestId: input.request.providerRequestId,
      kind: input.request.kind,
      status: "pending",
    },
  })
  await input.onEvent?.(userInputEvent)

  const approvalEvent = insertRunEvent(input.db, input.runId, {
    type: "approval_request",
    providerType: input.request.providerType ?? null,
    providerId: input.request.providerId ?? input.request.providerRequestId,
    payload: {
      ...(input.request.payload ?? {}),
      approvalId: approval.id,
      providerRequestId: input.request.providerRequestId,
      kind: input.request.kind,
      prompt: input.request.prompt,
      details: input.request.details ?? {},
      status: "pending",
    },
  })
  await input.onEvent?.(approvalEvent)

  return new Promise((resolve) => {
    pendingAgentApprovals.set(approval.id, {
      runId: input.runId,
      resolve,
    })
  })
}

function resolvePendingAgentRunApprovals(input: {
  db: Db
  runId: string
  approved: boolean
  status: "approved" | "denied" | "cancelled"
  message?: string | null
}): void {
  const pendingIds = Array.from(pendingAgentApprovals.entries())
    .filter(([, pending]) => pending.runId === input.runId)
    .map(([approvalId]) => approvalId)

  for (const approvalId of pendingIds) {
    respondToAgentRunApproval({
      approvalId,
      approved: input.approved,
      message: input.message ?? null,
      status: input.status,
      db: input.db,
    })
  }
}

function updateApprovalRequestEventPayload(input: {
  db: Db
  runId: string
  approvalId: string
  status: "approved" | "denied" | "cancelled"
  approved: boolean
  message?: string | null
  response?: Record<string, unknown> | null
}): void {
  const events = input.db
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.agentRunId, input.runId))
    .all()
  for (const event of events) {
    if (event.type !== "approval_request") continue
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(event.payloadJson || "{}")
    } catch {
      continue
    }
    if (payload.approvalId !== input.approvalId) continue
    input.db
      .update(agentRunEvents)
      .set({
        payloadJson: JSON.stringify({
          ...payload,
          status: input.status,
          approved: input.approved,
          message: input.message ?? null,
          response: input.response ?? null,
        }),
      })
      .where(eq(agentRunEvents.id, event.id))
      .run()
    return
  }
}

function cancelStaleAgentApproval(input: {
  db: Db
  approval: typeof agentApprovals.$inferSelect
  message: string
}): void {
  const now = new Date()
  const run = input.db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, input.approval.agentRunId))
    .get()
  const response = {
    approved: false,
    message: input.message,
    response: null,
  }
  input.db
    .update(agentApprovals)
    .set({
      status: "cancelled",
      responseJson: JSON.stringify(response),
      resolvedAt: now,
    })
    .where(eq(agentApprovals.id, input.approval.id))
    .run()

  if (run && isActiveAgentRunStatus(run.status)) {
    const recoverable = input.db
      .update(agentRuns)
      .set({
        status: "recoverable",
        errorMessage: input.message,
        completedAt: now,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, input.approval.agentRunId))
      .returning()
      .get()
    clearConversationStreamForRun(input.db, recoverable)
  }

  updateApprovalRequestEventPayload({
    db: input.db,
    runId: input.approval.agentRunId,
    approvalId: input.approval.id,
    status: "cancelled",
    approved: false,
    message: input.message,
    response: null,
  })
}

export function respondToAgentRunApproval(input: {
  approvalId: string
  approved: boolean
  message?: string | null
  response?: Record<string, unknown> | null
  status?: "approved" | "denied" | "cancelled"
  db?: Db
}): { ok: boolean; status?: string; reason?: string } {
  const db = input.db ?? getDatabase()
  const approval = db
    .select()
    .from(agentApprovals)
    .where(eq(agentApprovals.id, input.approvalId))
    .get()
  if (!approval) {
    return { ok: false, reason: "not_found" }
  }

  const pending = pendingAgentApprovals.get(input.approvalId)
  if (!pending) {
    if (approval.status === "pending") {
      cancelStaleAgentApproval({
        db,
        approval,
        message:
          "Ripple restarted before this approval could be resolved. Start a new request to continue.",
      })
      return {
        ok: false,
        reason: "not_active",
        status: "cancelled",
      }
    }
    return {
      ok: false,
      reason: "not_pending",
      status: approval.status,
    }
  }

  const status = input.status ?? (input.approved ? "approved" : "denied")
  const now = new Date()
  const response = {
    approved: input.approved,
    message: input.message ?? null,
    response: input.response ?? null,
  }
  db
    .update(agentApprovals)
    .set({
      status,
      responseJson: JSON.stringify(response),
      resolvedAt: now,
    })
    .where(eq(agentApprovals.id, input.approvalId))
    .run()

  if (status !== "cancelled") {
    db
      .update(agentRuns)
      .set({
        status: "running",
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, approval.agentRunId))
      .run()
  }

  updateApprovalRequestEventPayload({
    db,
    runId: approval.agentRunId,
    approvalId: input.approvalId,
    status,
    approved: input.approved,
    message: input.message ?? null,
    response: input.response ?? null,
  })

  pendingAgentApprovals.delete(input.approvalId)
  pending?.resolve({
    approvalId: input.approvalId,
    approved: input.approved,
    message: input.message ?? null,
    response: input.response ?? null,
  })

  return { ok: true, status }
}

async function markAgentRunCancelled(input: {
  db: Db
  runId: string
  onEvent?: (event: AgentRunEvent) => void | Promise<void>
}): Promise<AgentRun> {
  const now = new Date()
  const cancelled = input.db
    .update(agentRuns)
    .set({
      status: "cancelled",
      completedAt: now,
      heartbeatAt: now,
      updatedAt: now,
      errorMessage: null,
    })
    .where(eq(agentRuns.id, input.runId))
    .returning()
    .get()
  clearConversationStreamForRun(input.db, cancelled)
  const sessionEvent = insertRunEvent(input.db, input.runId, {
    type: "session.exited",
    providerType: "ripple:runtime",
    providerId: cancelled.providerSessionId ?? cancelled.requestId,
    payload: {
      status: "cancelled",
      requestId: cancelled.requestId,
      sessionId: cancelled.providerSessionId,
    },
    refs: {
      requestId: cancelled.requestId,
      turnId: cancelled.providerTurnId,
    },
  })
  await input.onEvent?.(sessionEvent)
  const requestEvent = insertRunEvent(input.db, input.runId, {
    type: "request.completed",
    providerType: "ripple:runtime",
    providerId: cancelled.requestId,
    payload: {
      status: "cancelled",
      requestId: cancelled.requestId,
    },
    refs: {
      requestId: cancelled.requestId,
      turnId: cancelled.providerTurnId,
    },
  })
  await input.onEvent?.(requestEvent)
  const event = insertRunEvent(input.db, input.runId, {
    type: "status",
    payload: { status: "cancelled" },
  })
  await input.onEvent?.(event)
  return cancelled
}

function findOrCreateAgentThread(
  db: Db,
  input: StartAgentRunInput,
  resolved: ReturnType<typeof resolveAgentWorkspaceContext>,
  connectionId: string,
): AgentThread {
  if (input.revisionId) {
    const revision = db
      .select()
      .from(revisions)
      .where(eq(revisions.id, input.revisionId))
      .get()
    if (revision?.agentThreadId) {
      const existing = db
        .select()
        .from(agentThreads)
        .where(eq(agentThreads.id, revision.agentThreadId))
        .get()
      if (
        existing &&
        existing.provider === input.provider &&
        existing.connectionId === connectionId
      ) {
        return existing
      }
    }
  }

  const existingByPurpose = db
    .select()
    .from(agentThreads)
    .where(and(
      eq(agentThreads.workspaceId, resolved.workspace.id),
      eq(agentThreads.provider, input.provider),
      eq(agentThreads.connectionId, connectionId),
      eq(agentThreads.purpose, input.runKind),
      input.conversationId
        ? eq(agentThreads.conversationId, input.conversationId)
        : input.revisionId
          ? eq(agentThreads.revisionId, input.revisionId)
          : input.chatId
            ? eq(agentThreads.chatId, input.chatId)
            : eq(agentThreads.projectId, resolved.project.id),
    ))
    .orderBy(desc(agentThreads.createdAt))
    .get()
  if (existingByPurpose) return existingByPurpose

  const now = new Date()
  return db
    .insert(agentThreads)
    .values({
      projectId: resolved.project.id,
      workspaceId: resolved.workspace.id,
      connectionId,
      provider: input.provider,
      purpose: input.runKind,
      conversationId: input.conversationId ?? null,
      chatId: input.chatId ?? null,
      subChatId: input.subChatId ?? null,
      revisionId: input.revisionId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
}

export async function getAgentProviderAuthStatus(
  provider: "codex" | "claude" | "fake",
): Promise<ProviderAuthStatus> {
  return createAgentProviderAdapter(provider).checkAuth()
}

export function startAgentRun(input: StartAgentRunInput): StartAgentRunResult {
  const db = getDatabase()
  const resolved = resolveAgentWorkspaceContext(input.target, db)
  const connection = ensureDefaultAgentConnection(input.provider, db)
  const thread = findOrCreateAgentThread(db, input, resolved, connection.id)

  const existingByRequest = db
    .select()
    .from(agentRuns)
    .where(and(
      eq(agentRuns.agentThreadId, thread.id),
      eq(agentRuns.requestId, input.requestId),
    ))
    .get()
  if (existingByRequest) {
    if (isActiveAgentRunStatus(existingByRequest.status)) {
      setConversationStreamForRun(db, existingByRequest)
    }
    return {
      run: existingByRequest,
      thread,
      workspace: resolved.workspace,
      connection,
      reused: true,
    }
  }

  const activeRun = db
    .select()
    .from(agentRuns)
    .where(and(
      eq(agentRuns.agentThreadId, thread.id),
      inArray(agentRuns.status, [...activeStatuses()]),
    ))
    .orderBy(desc(agentRuns.createdAt))
    .get()
  if (activeRun) {
    setConversationStreamForRun(db, activeRun)
    return {
      run: activeRun,
      thread,
      workspace: resolved.workspace,
      connection,
      reused: true,
    }
  }

  const now = new Date()
  const runtimeContextJson = serializeAgentRuntimeContextPayload(input.runtimeContext ?? null)
  const run = db.transaction(() => {
    const created = db
      .insert(agentRuns)
      .values({
        agentThreadId: thread.id,
        workspaceId: resolved.workspace.id,
        connectionId: connection.id,
        requestId: input.requestId,
        provider: input.provider,
        model: input.model ?? connection.defaultModel,
        mode: input.mode ?? "agent",
        runKind: input.runKind,
        conversationId: input.conversationId ?? null,
        revisionId: input.revisionId ?? null,
        threadId: input.commentThreadId ?? null,
        chatId: input.chatId ?? null,
        subChatId: input.subChatId ?? null,
        runtimeContextJson,
        status: "queued",
        prompt: input.prompt,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()

    if (input.revisionId) {
      db.update(revisions)
        .set({
          agentProvider: input.provider,
          agentModel: input.model ?? connection.defaultModel,
          agentThreadId: thread.id,
          agentRunId: created.id,
          conversationId: input.conversationId ?? null,
          updatedAt: now,
        })
        .where(eq(revisions.id, input.revisionId))
        .run()
    }

    db.update(agentThreads)
      .set({
        connectionId: connection.id,
        workspaceId: resolved.workspace.id,
        conversationId: input.conversationId ?? thread.conversationId ?? null,
        updatedAt: now,
      })
      .where(eq(agentThreads.id, thread.id))
      .run()

    setConversationStreamForRun(db, created)
    recordRunUserPromptProjection({ db, thread, run: created })
    insertRunEvent(db, created.id, {
      type: "status",
      payload: { status: "queued" },
    })
    insertRunEvent(db, created.id, {
      type: "request.opened",
      providerType: "ripple:runtime",
      providerId: created.requestId,
      payload: {
        status: "queued",
        requestId: created.requestId,
      },
      refs: {
        requestId: created.requestId,
      },
    })
    return created
  })

  return {
    run,
    thread,
    workspace: resolved.workspace,
    connection,
    reused: false,
  }
}

export async function executeAgentRun(
  runId: string,
  options: {
    attachments?: AgentRuntimeAttachment[]
    authConfig?: { apiKey?: string } | null
    onEvent?: (event: AgentRunEvent) => void | Promise<void>
  } = {},
): Promise<AgentRun> {
  const db = getDatabase()
  let context = requireRunContext(db, runId)

  if (
    context.run.status === "running" ||
    context.run.status === "awaiting_approval" ||
    context.run.status === "cancelling"
  ) {
    return context.run
  }

  if (!isActiveAgentRunStatus(context.run.status)) {
    return context.run
  }

  const adapter = createAgentProviderAdapter(context.run.provider)
  const now = new Date()
  let lastAssistantMessageEvent: AgentRunEvent | null = null
  context.run = db
    .update(agentRuns)
    .set({
      status: "running",
      startedAt: context.run.startedAt ?? now,
      heartbeatAt: now,
      errorMessage: null,
      updatedAt: now,
    })
    .where(eq(agentRuns.id, runId))
    .returning()
    .get()
  const runningEvent = insertRunEvent(db, runId, {
    type: "status",
    payload: { status: "running" },
  })
  await options.onEvent?.(runningEvent)
  const turnStartedEvent = insertRunEvent(db, runId, {
    type: "turn.started",
    providerType: "ripple:runtime",
    providerId: context.run.providerTurnId ?? context.run.requestId,
    payload: {
      status: "running",
      requestId: context.run.requestId,
      turnId: context.run.providerTurnId,
    },
    refs: {
      requestId: context.run.requestId,
      turnId: context.run.providerTurnId,
    },
  })
  await options.onEvent?.(turnStartedEvent)

  const sink: AgentProviderEventSink = {
    emit: async (event) => {
      const inserted = insertRunEvent(db, runId, event)
      if (event.type === "assistant_message") {
        lastAssistantMessageEvent = inserted
      }
      await options.onEvent?.(inserted)
      return inserted
    },
    requestApproval: async (request) => {
      const decision = await requestAgentRunApproval({
        db,
        runId,
        request,
        onEvent: options.onEvent,
      })
      if (isCancellationRequested(db, runId)) {
        throw new AgentRunCancelledError()
      }
      return decision
    },
    setProviderIds: async (ids) => {
      const runPatch: Partial<AgentRun> = {}
      const threadPatch: Partial<AgentThread> = {}
      if (ids.providerTurnId !== undefined) {
        runPatch.providerTurnId = ids.providerTurnId
      }
      if (ids.providerSessionId !== undefined) {
        runPatch.providerSessionId = ids.providerSessionId
        threadPatch.providerSessionId = ids.providerSessionId
      }
      if (ids.providerItemId !== undefined) {
        runPatch.providerItemId = ids.providerItemId
      }
      if (ids.providerThreadId !== undefined) {
        threadPatch.providerThreadId = ids.providerThreadId
      }
      if (Object.keys(runPatch).length > 0) {
        context.run = db
          .update(agentRuns)
          .set({ ...runPatch, updatedAt: new Date() })
          .where(eq(agentRuns.id, runId))
          .returning()
          .get()
      }
      if (Object.keys(threadPatch).length > 0) {
        context.thread = db
          .update(agentThreads)
          .set({ ...threadPatch, updatedAt: new Date() })
          .where(eq(agentThreads.id, context.thread.id))
          .returning()
          .get()
      }
      if (ids.providerSessionId !== undefined && context.run.conversationId) {
        db.update(conversations)
          .set({
            sessionId: ids.providerSessionId,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, context.run.conversationId))
          .run()
      }
    },
    isCancellationRequested: () => {
      return isCancellationRequested(db, runId)
    },
  }

  try {
    const visualContext = await resolveCommentVisualAttachmentsForRun({
      db,
      run: context.run,
      projectPath: context.projectPath,
    }).catch((error) => {
      console.warn("[Ripple] Could not load comment visual context:", error)
      return { attachments: [], promptContext: null, visualContext: null }
    })
    const mergedAttachments = appendOptionalAgentRuntimeAttachments({
      attachments: options.attachments,
      optionalAttachments: visualContext.attachments,
    })
    if (mergedAttachments.droppedOptionalAttachments.length > 0) {
      console.warn("[Ripple] Dropped automatic comment visual context because attachment limits were reached.")
    }
    const runtimeContext = parseAgentRuntimeContextPayload(context.run.runtimeContextJson)
    const providerPrompt = appendRuntimeContextToPrompt({
      prompt: context.run.prompt,
      context: [
        buildConversationHistoryContext({
          db,
          run: context.run,
          thread: context.thread,
        }),
        buildAgentRuntimeContextPrompt({
          db,
          resolved: {
            workspace: context.workspace,
            project: context.project,
            cwd: context.workspace.path,
            projectPath: context.projectPath,
            writableRoot: context.writableRoot,
            kind: context.workspaceKind,
            targetType: context.targetType,
            targetId: context.targetId,
          },
          runtime: {
            runtimeContext,
            runKind: context.run.runKind,
            commentThreadId: context.run.threadId,
            revisionId: context.run.revisionId,
          },
        }),
        mergedAttachments.acceptedOptionalAttachments.length > 0
          ? visualContext.promptContext
          : null,
      ].filter(Boolean).join("\n\n"),
    })
    const result = await adapter.run({
      ...context,
      prompt: providerPrompt,
      cwd: context.workspace.path,
      mode: context.run.mode,
      model: context.run.model,
      attachments: mergedAttachments.attachments,
      commentVisualContext: visualContext.visualContext,
      currentFrameSnapshot: resolveAgentRuntimeCurrentFrameSnapshot({
        db,
        resolved: {
          workspace: context.workspace,
          project: context.project,
          cwd: context.workspace.path,
          projectPath: context.projectPath,
          writableRoot: context.writableRoot,
          kind: context.workspaceKind,
          targetType: context.targetType,
          targetId: context.targetId,
        },
        runtimeContext,
      }),
      authConfig: options.authConfig ?? null,
    }, sink)
    if (isCancellationRequested(db, runId)) {
      throw new AgentRunCancelledError()
    }
    await sink.setProviderIds({
      providerThreadId: result.providerThreadId,
      providerTurnId: result.providerTurnId,
      providerSessionId: result.providerSessionId,
    })

    const summary = result.summary?.trim() || "Agent finished this run."
    let finalEvent: AgentRunEvent | null = lastAssistantMessageEvent
    if (!finalEvent) {
      finalEvent = insertRunEvent(db, runId, {
        type: "assistant_message",
        payload: { text: summary },
      })
      await options.onEvent?.(finalEvent)
    }
    const turnCompletedEvent = insertRunEvent(db, runId, {
      type: "turn.completed",
      providerType: "ripple:runtime",
      providerId: context.run.providerTurnId ?? context.run.requestId,
      payload: {
        status: "completed",
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
      refs: {
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
    })
    await options.onEvent?.(turnCompletedEvent)
    const requestCompletedEvent = insertRunEvent(db, runId, {
      type: "request.completed",
      providerType: "ripple:runtime",
      providerId: context.run.requestId,
      payload: {
        status: "completed",
        requestId: context.run.requestId,
      },
      refs: {
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
    })
    await options.onEvent?.(requestCompletedEvent)
    const sessionExitedEvent = insertRunEvent(db, runId, {
      type: "session.exited",
      providerType: "ripple:runtime",
      providerId: context.run.providerSessionId ?? context.thread.providerSessionId ?? context.run.requestId,
      payload: {
        status: "completed",
        requestId: context.run.requestId,
        sessionId: context.run.providerSessionId ?? context.thread.providerSessionId,
      },
      refs: {
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
    })
    await options.onEvent?.(sessionExitedEvent)
    const completed = db
      .update(agentRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        heartbeatAt: new Date(),
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(agentRuns.id, runId))
      .returning()
      .get()
    clearConversationStreamForRun(db, completed)
    const assistantProjection = buildAgentRuntimeAssistantProjection({
      events: listAgentRunEvents(runId),
      messageId: `agent-run-${completed.id}`,
      fallbackText: summary,
    })
    recordRunAssistantProjection({
      db,
      thread: context.thread,
      run: completed,
      sourceEvent: finalEvent,
      summary,
      parts: assistantProjection.parts,
      metadata: assistantProjection.metadata,
    })
    const completedEvent = insertRunEvent(db, runId, {
      type: "status",
      payload: { status: "completed" },
    })
    await options.onEvent?.(completedEvent)
    return completed
  } catch (error) {
    resolvePendingAgentRunApprovals({
      db,
      runId,
      approved: false,
      status: "cancelled",
      message: "Agent run stopped before this approval was answered.",
    })
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof AgentRunCancelledError || isCancellationRequested(db, runId)) {
      return markAgentRunCancelled({
        db,
        runId,
        onEvent: options.onEvent,
      })
    }
    const errorEvent = insertRunEvent(db, runId, {
      type: "error",
      payload: { message },
    })
    await options.onEvent?.(errorEvent)
    const failedSessionEvent = insertRunEvent(db, runId, {
      type: "session.exited",
      providerType: "ripple:runtime",
      providerId: context.run.providerSessionId ?? context.thread.providerSessionId ?? context.run.requestId,
      payload: {
        status: "failed",
        requestId: context.run.requestId,
        sessionId: context.run.providerSessionId ?? context.thread.providerSessionId,
      },
      refs: {
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
    })
    await options.onEvent?.(failedSessionEvent)
    const failedRequestEvent = insertRunEvent(db, runId, {
      type: "request.completed",
      providerType: "ripple:runtime",
      providerId: context.run.requestId,
      payload: {
        status: "failed",
        requestId: context.run.requestId,
      },
      refs: {
        requestId: context.run.requestId,
        turnId: context.run.providerTurnId,
      },
    })
    await options.onEvent?.(failedRequestEvent)
    const failed = db
      .update(agentRuns)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
        heartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId))
      .returning()
      .get()
    clearConversationStreamForRun(db, failed)
    const failedEvent = insertRunEvent(db, runId, {
      type: "status",
      payload: { status: "failed" },
    })
    await options.onEvent?.(failedEvent)
    throw error
  }
}

export async function cancelAgentRun(runId: string): Promise<AgentRun> {
  const db = getDatabase()
  const existing = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get()
  if (!existing) throw new Error("Agent run not found.")
  if (!isActiveAgentRunStatus(existing.status)) {
    return existing
  }

  const run = db
    .update(agentRuns)
    .set({
      status: "cancelling",
      cancelRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId))
    .returning()
    .get()
  insertRunEvent(db, runId, {
    type: "status",
    payload: { status: "cancelling" },
  })
  resolvePendingAgentRunApprovals({
    db,
    runId,
    approved: false,
    status: "cancelled",
    message: "Agent run cancelled.",
  })
  await createAgentProviderAdapter(run.provider).cancel?.(runId)
  return markAgentRunCancelled({ db, runId })
}

export function getAgentRun(runId: string): AgentRun | null {
  return getDatabase()
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get() ?? null
}

export function listAgentRunEvents(runId: string): AgentRunEvent[] {
  return getDatabase()
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.agentRunId, runId))
    .orderBy(agentRunEvents.sequence)
    .all()
}

export function recoverAgentRunsOnStartup(): { recoverable: number } {
  const db = getDatabase()
  const interrupted = db
    .select()
    .from(agentRuns)
    .where(inArray(agentRuns.status, [
      "preparing",
      "running",
      "awaiting_approval",
      "cancelling",
    ]))
    .all()
  const now = new Date()

  for (const run of interrupted) {
    const message =
      "Ripple restarted while this agent run was active. Continue from the saved transcript."
    db.update(agentRuns)
      .set({
        status: "recoverable",
        errorMessage: message,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
      .run()
    clearConversationStreamForRun(db, run)
    const pendingApprovals = db
      .select()
      .from(agentApprovals)
      .where(and(
        eq(agentApprovals.agentRunId, run.id),
        eq(agentApprovals.status, "pending"),
      ))
      .all()
    for (const approval of pendingApprovals) {
      db
        .update(agentApprovals)
        .set({
          status: "cancelled",
          responseJson: JSON.stringify({
            approved: false,
            message,
            response: null,
          }),
          resolvedAt: now,
        })
        .where(eq(agentApprovals.id, approval.id))
        .run()
      updateApprovalRequestEventPayload({
        db,
        runId: run.id,
        approvalId: approval.id,
        status: "cancelled",
        approved: false,
        message,
        response: null,
      })
    }
    insertRunEvent(db, run.id, {
      type: "session.exited",
      providerType: "ripple:runtime",
      providerId: run.providerSessionId ?? run.requestId,
      payload: {
        status: "recoverable",
        reason: "app_restart",
        requestId: run.requestId,
      },
      refs: {
        requestId: run.requestId,
        turnId: run.providerTurnId,
      },
    })
    insertRunEvent(db, run.id, {
      type: "status",
      payload: {
        status: "recoverable",
        reason: "app_restart",
      },
    })
  }

  const stalePendingApprovals = db
    .select()
    .from(agentApprovals)
    .where(eq(agentApprovals.status, "pending"))
    .all()
  for (const approval of stalePendingApprovals) {
    cancelStaleAgentApproval({
      db,
      approval,
      message:
        "Ripple restarted before this approval could be resolved. Start a new request to continue.",
    })
  }

  return { recoverable: interrupted.length }
}
