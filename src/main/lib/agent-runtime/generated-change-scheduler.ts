import { eq } from "drizzle-orm"
import {
  getDatabase,
  revisions,
  subChats,
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
import type { AgentProviderId } from "./types"

export interface GeneratedChangeSchedulerResult {
  updated: number
  claimed: boolean
  revisionId: string | null
  agentRunId: string | null
  status: "idle" | "completed" | "failed" | "running"
  errorMessage?: string | null
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

function extractPrompt(messages: any[]): string {
  const message = [...messages].reverse().find((item) => item?.role === "user")
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

function inferProviderFromMessages(messages: any[]): AgentProviderId {
  const model = [...messages]
    .reverse()
    .map((message) => message?.metadata?.model)
    .find((value): value is string => typeof value === "string")
  return inferAgentProviderFromModel(model)
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

function resolveRunIntent(job: RevisionQueueRun): {
  prompt: string
  provider: AgentProviderId
  model: string | null
  requestId: string
} {
  const revision = loadRevision(job.revisionId)
  const messages = parseMessages(job.messages)
  const model = revision.agentModel ??
    [...messages]
      .reverse()
      .map((message) => message?.metadata?.model)
      .find((value): value is string => typeof value === "string") ??
    null

  return {
    prompt: extractPrompt(messages),
    provider: revision.agentProvider ?? inferProviderFromMessages(messages),
    model,
    requestId: `revision:${revision.id}:${revision.updatedAt?.getTime() ?? Date.now()}`,
  }
}

export async function processGeneratedChangeQueue(input: {
  projectId?: string | null
} = {}): Promise<GeneratedChangeSchedulerResult> {
  const queue = await claimNextRevisionRun(input)
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

  try {
    const started = startAgentRun({
      target: { type: "revision", revisionId: job.revisionId },
      provider: intent.provider,
      model: intent.model,
      requestId: intent.requestId,
      prompt: intent.prompt,
      runKind: "generated_change",
      mode: job.mode,
      chatId: job.chatId,
      subChatId: job.subChatId,
      commentThreadId: job.threadId,
      revisionId: job.revisionId,
    })

    const run = await executeAgentRun(started.run.id)
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
  const result = await processGeneratedChangeQueue(input)
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

export function getSubChatPrompt(subChatId: string): string {
  const subChat = getDatabase()
    .select({ messages: subChats.messages })
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get()
  return extractPrompt(parseMessages(subChat?.messages))
}
