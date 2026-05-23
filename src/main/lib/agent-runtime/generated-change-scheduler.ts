import { eq } from "drizzle-orm"
import {
  commentThreads,
  getDatabase,
  revisions,
  type CommentThread,
  type Revision,
} from "../db"
import {
  claimNextRevisionRun,
  completeRevisionRun,
  failRevisionRun,
  processQueuedRevisionUpdates,
  type RevisionQueueRun,
} from "../revisions/revision-queue"
import { compactOneLineSummary } from "../revisions/comment-summary"
import { executeAgentRun, startAgentRun } from "./service"
import { inferAgentProviderFromModel } from "./provider-selection"
import { buildGeneratedChangeRuntimeContext } from "./generated-change-runtime-context"
import { drainGeneratedChangeQueueForProject } from "./generated-change-queue-drain"
import type { AgentProviderId, AgentRunStatus, AgentRuntimeAttachment } from "./types"

export interface GeneratedChangeSchedulerResult {
  updated: number
  claimed: boolean
  revisionId: string | null
  agentRunId: string | null
  status: "idle" | "completed" | "failed" | "running"
  errorMessage?: string | null
}

const ACTIVE_RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "preparing",
  "running",
  "awaiting_approval",
  "cancelling",
])

const pendingProjectIds = new Set<string | null>()
let scheduledDrain: ReturnType<typeof setTimeout> | null = null
let activeDrain: Promise<void> | null = null

function normalizeProjectId(input: {
  projectId?: string | null
} = {}): string | null {
  return input.projectId ?? null
}

function enqueueProject(input: {
  projectId?: string | null
} = {}): void {
  const projectId = normalizeProjectId(input)
  if (projectId === null) {
    pendingProjectIds.clear()
    pendingProjectIds.add(null)
    return
  }
  if (!pendingProjectIds.has(null)) {
    pendingProjectIds.add(projectId)
  }
}

function takeNextProjectId(): string | null | undefined {
  if (pendingProjectIds.has(null)) {
    pendingProjectIds.delete(null)
    return null
  }
  const next = pendingProjectIds.values().next()
  if (next.done) return undefined
  pendingProjectIds.delete(next.value)
  return next.value
}

async function drainProjectGeneratedChangeQueue(
  input: { projectId?: string | null } = {},
): Promise<void> {
  await processQueuedRevisionUpdates(input)
  await drainGeneratedChangeQueueForProject(input, {
    processor: (processorInput) =>
      processGeneratedChangeQueue(processorInput, { processUpdates: false }),
  })
}

async function drainGeneratedChangeQueue(): Promise<void> {
  const drains: Promise<void>[] = []
  while (pendingProjectIds.size > 0) {
    const projectId = takeNextProjectId()
    if (projectId === undefined) break
    drains.push(drainProjectGeneratedChangeQueue({ projectId }))
  }
  await Promise.all(drains)
}

function ensureDrainScheduled(): void {
  if (scheduledDrain || activeDrain) return

  scheduledDrain = setTimeout(() => {
    scheduledDrain = null
    activeDrain = drainGeneratedChangeQueue()
      .catch((error) => {
        console.warn("[Ripple] Generated-change queue failed:", error)
      })
      .finally(() => {
        activeDrain = null
        if (pendingProjectIds.size > 0) {
          ensureDrainScheduled()
        }
      })
  }, 0)
}

export function scheduleGeneratedChangeQueue(input: {
  projectId?: string | null
} = {}): void {
  enqueueProject(input)
  ensureDrainScheduled()
}

function parseMessages(value: string | null | undefined): any[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function latestUserMessage(messages: any[]): any | undefined {
  return [...messages].reverse().find((item) => item?.role === "user")
}

function latestModelFromMessages(messages: any[]): string | null {
  return [...messages]
    .reverse()
    .map((message) => message?.metadata?.model)
    .find((value): value is string => typeof value === "string") ?? null
}

function extractPrompt(messages: any[]): string {
  const message = latestUserMessage(messages)
  const parts = Array.isArray(message?.parts) ? message.parts : []
  const text = parts
    .map((part: any) =>
      part?.type === "text" && typeof part.text === "string" ? part.text : null,
    )
    .filter((part: string | null): part is string => Boolean(part))
    .join("\n")
    .trim()
  return text || "Continue this generated change."
}

function extractAttachments(messages: any[]): AgentRuntimeAttachment[] {
  const message = latestUserMessage(messages)
  const parts = Array.isArray(message?.parts) ? message.parts : []
  const attachments: AgentRuntimeAttachment[] = []

  for (const part of parts) {
    if (part?.type === "data-image" && part.data?.base64Data && part.data?.mediaType) {
      attachments.push({
        type: "image",
        base64Data: part.data.base64Data,
        mediaType: part.data.mediaType,
        filename: part.data.filename,
      })
    } else if (part?.type === "data-file" && part.data?.base64Data) {
      attachments.push({
        type: "file",
        base64Data: part.data.base64Data,
        mediaType: part.data.mediaType,
        filename: part.data.filename || "file",
        size: typeof part.data.size === "number" ? part.data.size : undefined,
      })
    }
  }

  return attachments
}

function inferProviderFromMessages(messages: any[]): AgentProviderId {
  return inferAgentProviderFromModel(latestModelFromMessages(messages))
}

function loadRevision(revisionId: string): Revision {
  const revision = getDatabase()
    .select()
    .from(revisions)
    .where(eq(revisions.id, revisionId))
    .get()
  if (!revision) throw new Error("Generated change not found.")
  return revision
}

function loadCommentThread(threadId: string): CommentThread | null {
  return getDatabase()
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .get() ?? null
}

function resolveRunIntent(job: RevisionQueueRun): {
  prompt: string
  provider: AgentProviderId
  model: string | null
  requestId: string
  attachments: AgentRuntimeAttachment[]
} {
  const revision = loadRevision(job.revisionId)
  const messages = parseMessages(job.messages)
  const model = revision.agentModel ?? latestModelFromMessages(messages)

  return {
    prompt: job.prompt || extractPrompt(messages),
    provider: revision.agentProvider ?? inferProviderFromMessages(messages),
    model,
    requestId: `revision:${revision.id}:${revision.updatedAt?.getTime() ?? Date.now()}`,
    attachments: extractAttachments(messages),
  }
}

export async function processGeneratedChangeQueue(input: {
  projectId?: string | null
} = {}, options: {
  processUpdates?: boolean
} = {}): Promise<GeneratedChangeSchedulerResult> {
  const queue = await claimNextRevisionRun(input, {
    processUpdates: options.processUpdates,
  })
  if (!queue.job) {
    return {
      updated: queue.updated,
      claimed: false,
      revisionId: null,
      agentRunId: null,
      status: "idle",
    }
  }

  const job = queue.job
  const intent = resolveRunIntent(job)
  const runtimeContext = buildGeneratedChangeRuntimeContext({
    job,
    thread: loadCommentThread(job.threadId),
  })

  try {
    const started = startAgentRun({
      target: { type: "revision", revisionId: job.revisionId },
      provider: intent.provider,
      model: intent.model,
      requestId: intent.requestId,
      prompt: intent.prompt,
      runKind: "generated_change",
      mode: job.mode,
      conversationId: job.conversationId,
      chatId: job.chatId,
      subChatId: job.subChatId,
      commentThreadId: job.threadId,
      revisionId: job.revisionId,
      runtimeContext,
    })

    const run = await executeAgentRun(started.run.id, {
      attachments: intent.attachments,
    })
    if (run.status !== "completed") {
      if (ACTIVE_RUN_STATUSES.has(run.status as AgentRunStatus)) {
        return {
          updated: queue.updated,
          claimed: true,
          revisionId: job.revisionId,
          agentRunId: run.id,
          status: "running",
        }
      }

      const errorMessage = compactOneLineSummary(
        run.status === "cancelled"
          ? "This generated change was cancelled."
          : run.errorMessage || `Agent run ended with status ${run.status}.`,
        { tone: "error" },
      ) || "Ripple could not finish this generated change."
      await failRevisionRun({
        revisionId: job.revisionId,
        errorMessage,
      })
      return {
        updated: queue.updated,
        claimed: true,
        revisionId: job.revisionId,
        agentRunId: run.id,
        status: "failed",
        errorMessage,
      }
    }

    await completeRevisionRun(job.revisionId)
    return {
      updated: queue.updated,
      claimed: true,
      revisionId: job.revisionId,
      agentRunId: run.id,
      status: "completed",
    }
  } catch (error) {
    const errorMessage = compactOneLineSummary(
      error instanceof Error ? error.message : String(error),
      { tone: "error" },
    ) || "Ripple could not run this generated change."
    await failRevisionRun({
      revisionId: job.revisionId,
      errorMessage,
    })
    return {
      updated: queue.updated,
      claimed: true,
      revisionId: job.revisionId,
      agentRunId: loadRevision(job.revisionId).agentRunId,
      status: "failed",
      errorMessage,
    }
  }
}

export async function nudgeGeneratedChangeQueue(input: {
  projectId?: string | null
} = {}): Promise<GeneratedChangeSchedulerResult> {
  const updated = await processQueuedRevisionUpdates(input)
  const result = await processGeneratedChangeQueue(input, { processUpdates: false })
  return {
    ...result,
    updated: updated + result.updated,
  }
}

export function backfillRevisionAgentProvider(input: {
  revisionId: string
  model?: string | null
}): void {
  const db = getDatabase()
  const revision = db
    .select({ id: revisions.id, agentProvider: revisions.agentProvider })
    .from(revisions)
    .where(eq(revisions.id, input.revisionId))
    .get()
  if (!revision || revision.agentProvider) return

  db.update(revisions)
    .set({
      agentProvider: inferAgentProviderFromModel(input.model),
      agentModel: input.model ?? null,
      updatedAt: new Date(),
    })
    .where(eq(revisions.id, input.revisionId))
    .run()
}
