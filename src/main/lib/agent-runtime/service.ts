import { EventEmitter } from "node:events"
import { and, desc, eq, inArray } from "drizzle-orm"
import { buildAgentRuntimeAssistantProjection } from "../../../shared/agent-runtime-ui-projection"
import {
  agentConnections,
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
import {
  appendRuntimeContextToPrompt,
  buildAgentRuntimeContextPrompt,
  parseAgentRuntimeContextPayload,
  serializeAgentRuntimeContextPayload,
} from "./run-editor-context"
import {
  isActiveAgentRunStatus,
  type AgentRuntimeAttachment,
  type AgentProviderEventSink,
  type AgentRunEventInput,
  type ProviderAuthStatus,
  type StartAgentRunInput,
  type StartAgentRunResult,
} from "./types"
import { resolveAgentWorkspaceContext } from "./workspace-context"

type Db = ReturnType<typeof getDatabase>
type AgentRunEventListener = (event: AgentRunEvent) => void
class AgentRunCancelledError extends Error {
  constructor() {
    super("Run cancelled.")
    this.name = "AgentRunCancelledError"
  }
}

const agentRunEventBus = new EventEmitter()
agentRunEventBus.setMaxListeners(0)

function activeStatuses() {
  return ["queued", "preparing", "running", "awaiting_approval", "cancelling"] as const
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

function insertRunEvent(
  db: Db,
  runId: string,
  event: AgentRunEventInput,
): AgentRunEvent {
  const inserted = db
    .insert(agentRunEvents)
    .values({
      agentRunId: runId,
      sequence: getNextEventSequence(db, runId),
      type: event.type,
      providerType: event.providerType ?? null,
      providerId: event.providerId ?? null,
      payloadJson: JSON.stringify(event.payload ?? {}),
      createdAt: new Date(),
    })
    .returning()
    .get()
  agentRunEventBus.emit(runId, inserted)
  return inserted
}

export function subscribeToAgentRunEvents(
  runId: string,
  listener: AgentRunEventListener,
): () => void {
  agentRunEventBus.on(runId, listener)
  return () => agentRunEventBus.off(runId, listener)
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

    recordRunUserPromptProjection({ db, thread, run: created })
    insertRunEvent(db, created.id, {
      type: "status",
      payload: { status: "queued" },
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

  const sink: AgentProviderEventSink = {
    emit: async (event) => {
      const inserted = insertRunEvent(db, runId, event)
      if (event.type === "assistant_message") {
        lastAssistantMessageEvent = inserted
      }
      await options.onEvent?.(inserted)
      return inserted
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
    const providerPrompt = appendRuntimeContextToPrompt({
      prompt: context.run.prompt,
      context: buildAgentRuntimeContextPrompt({
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
          runtimeContext: parseAgentRuntimeContextPayload(context.run.runtimeContextJson),
          runKind: context.run.runKind,
          commentThreadId: context.run.threadId,
          revisionId: context.run.revisionId,
        },
      }),
    })
    const result = await adapter.run({
      ...context,
      prompt: providerPrompt,
      cwd: context.workspace.path,
      mode: context.run.mode,
      model: context.run.model,
      attachments: options.attachments,
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
    db.update(agentRuns)
      .set({
        status: "recoverable",
        errorMessage:
          "Ripple restarted while this agent run was active. Continue from the saved transcript.",
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
      .run()
    insertRunEvent(db, run.id, {
      type: "status",
      payload: {
        status: "recoverable",
        reason: "app_restart",
      },
    })
  }

  return { recoverable: interrupted.length }
}
