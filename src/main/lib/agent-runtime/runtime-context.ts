import { and, eq } from "drizzle-orm"
import {
  commentThreads,
  compositions,
  conversations,
  exportJobs,
  revisions,
  chats,
  type Composition,
  type Project,
} from "../db/schema"
import type { ResolvedWorkspaceContext } from "./workspace-context"

type Db = any

export type AgentRuntimePreviewSource =
  | { kind: "main" }
  | { kind: "comment-revision"; revisionId: string }
  | { kind: "chat-worktree"; conversationId?: string | null; chatId?: string | null }
  | { kind: "export"; exportJobId?: string | null; sourceLabel?: string | null }

export interface AgentRuntimeContextPayload {
  compositionId?: string | null
  previewTimeSeconds?: number | null
  previewFrame?: number | null
  previewSource?: AgentRuntimePreviewSource | null
  commentThreadId?: string | null
  revisionId?: string | null
  exportJobId?: string | null
}

export interface AgentRuntimeContextInput {
  runtimeContext?: AgentRuntimeContextPayload | null
  runKind: "chat" | "generated_change"
  commentThreadId?: string | null
  revisionId?: string | null
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function normalizeAgentRuntimeContextPayload(
  value: unknown,
): AgentRuntimeContextPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const previewSource = normalizePreviewSource(record.previewSource)

  return {
    compositionId: nonEmptyString(record.compositionId),
    previewTimeSeconds: finiteNonNegativeNumber(record.previewTimeSeconds),
    previewFrame: finiteNonNegativeNumber(record.previewFrame) === null
      ? null
      : Math.round(finiteNonNegativeNumber(record.previewFrame)!),
    previewSource,
    commentThreadId: nonEmptyString(record.commentThreadId),
    revisionId: nonEmptyString(record.revisionId),
    exportJobId: nonEmptyString(record.exportJobId),
  }
}

export function serializeAgentRuntimeContextPayload(
  value: unknown,
): string {
  return JSON.stringify(normalizeAgentRuntimeContextPayload(value) ?? {})
}

export function parseAgentRuntimeContextPayload(
  value: string | null | undefined,
): AgentRuntimeContextPayload | null {
  if (!value) return null
  try {
    return normalizeAgentRuntimeContextPayload(JSON.parse(value))
  } catch {
    return null
  }
}

function normalizePreviewSource(value: unknown): AgentRuntimePreviewSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const kind = record.kind
  if (kind === "main") return { kind }
  if (kind === "comment-revision") {
    const revisionId = nonEmptyString(record.revisionId)
    return revisionId ? { kind, revisionId } : null
  }
  if (kind === "chat-worktree") {
    return {
      kind,
      conversationId: nonEmptyString(record.conversationId),
      chatId: nonEmptyString(record.chatId),
    }
  }
  if (kind === "export") {
    return {
      kind,
      exportJobId: nonEmptyString(record.exportJobId),
      sourceLabel: nonEmptyString(record.sourceLabel),
    }
  }
  return null
}

function getProjectActiveComposition(db: Db, project: Project): Composition | null {
  if (!project.activeCompositionId) return null
  return db
    .select()
    .from(compositions)
    .where(and(
      eq(compositions.id, project.activeCompositionId),
      eq(compositions.projectId, project.id),
    ))
    .get() ?? null
}

function getCompositionById(db: Db, projectId: string, compositionId: string): Composition | null {
  return db
    .select()
    .from(compositions)
    .where(and(
      eq(compositions.id, compositionId),
      eq(compositions.projectId, projectId),
    ))
    .get() ?? null
}

function getTargetComposition(input: {
  db: Db
  resolved: ResolvedWorkspaceContext
  runtimeContext: AgentRuntimeContextPayload | null
}): Composition | null {
  if (input.runtimeContext?.compositionId) {
    const composition = getCompositionById(
      input.db,
      input.resolved.project.id,
      input.runtimeContext.compositionId,
    )
    if (composition) return composition
  }

  if (input.resolved.targetType === "conversation") {
    const conversation = input.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, input.resolved.targetId))
      .get()
    if (conversation?.compositionId) {
      const composition = getCompositionById(
        input.db,
        input.resolved.project.id,
        conversation.compositionId,
      )
      if (composition) return composition
    }
  }

  if (input.resolved.targetType === "revision") {
    const revision = input.db
      .select()
      .from(revisions)
      .where(eq(revisions.id, input.resolved.targetId))
      .get()
    if (revision?.compositionId) {
      const composition = getCompositionById(
        input.db,
        input.resolved.project.id,
        revision.compositionId,
      )
      if (composition) return composition
    }
  }

  return getProjectActiveComposition(input.db, input.resolved.project)
}

function previewSourceLabel(source: AgentRuntimePreviewSource | null | undefined): string | null {
  if (!source) return null
  if (source.kind === "main") return "Main"
  if (source.kind === "comment-revision") return `Comment revision ${source.revisionId}`
  if (source.kind === "chat-worktree") {
    return source.conversationId
      ? `Chat revision ${source.conversationId}`
      : source.chatId
        ? `Chat revision ${source.chatId}`
        : "Chat revision"
  }
  return source.sourceLabel
    ? `Export source ${source.sourceLabel}`
    : source.exportJobId
      ? `Export job ${source.exportJobId}`
      : "Export source"
}

function getExportSourceLabel(input: {
  db: Db
  projectId: string
  exportJobId?: string | null
}): string | null {
  if (!input.exportJobId) return null
  const job = input.db
    .select()
    .from(exportJobs)
    .where(and(
      eq(exportJobs.id, input.exportJobId),
      eq(exportJobs.projectId, input.projectId),
    ))
    .get()
  return job ? `${job.sourceLabel} (${job.label})` : null
}

function assertRuntimeEntityExists(input: {
  exists: boolean
  label: string
}): void {
  if (!input.exists) {
    throw new Error(`Ripple could not validate this ${input.label} for the agent run.`)
  }
}

function validateRuntimeContext(input: {
  db: Db
  projectId: string
  runtimeContext: AgentRuntimeContextPayload | null
}): void {
  const context = input.runtimeContext
  if (!context) return

  if (context.compositionId) {
    assertRuntimeEntityExists({
      label: "composition",
      exists: Boolean(getCompositionById(input.db, input.projectId, context.compositionId)),
    })
  }

  if (context.commentThreadId) {
    const thread = input.db
      .select()
      .from(commentThreads)
      .where(and(
        eq(commentThreads.id, context.commentThreadId),
        eq(commentThreads.projectId, input.projectId),
      ))
      .get()
    assertRuntimeEntityExists({ label: "comment", exists: Boolean(thread) })
  }

  const revisionId = context.revisionId ??
    (context.previewSource?.kind === "comment-revision"
      ? context.previewSource.revisionId
      : null)
  if (revisionId) {
    const revision = input.db
      .select()
      .from(revisions)
      .where(and(
        eq(revisions.id, revisionId),
        eq(revisions.projectId, input.projectId),
      ))
      .get()
    assertRuntimeEntityExists({ label: "revision", exists: Boolean(revision) })
  }

  if (context.previewSource?.kind === "chat-worktree") {
    if (context.previewSource.conversationId) {
      const conversation = input.db
        .select()
        .from(conversations)
        .where(and(
          eq(conversations.id, context.previewSource.conversationId),
          eq(conversations.projectId, input.projectId),
        ))
        .get()
      assertRuntimeEntityExists({ label: "chat revision", exists: Boolean(conversation) })
    }
    if (context.previewSource.chatId) {
      const chat = input.db
        .select()
        .from(chats)
        .where(and(
          eq(chats.id, context.previewSource.chatId),
          eq(chats.projectId, input.projectId),
        ))
        .get()
      assertRuntimeEntityExists({ label: "chat revision", exists: Boolean(chat) })
    }
  }

  const exportJobId = context.exportJobId ??
    (context.previewSource?.kind === "export"
      ? context.previewSource.exportJobId
      : null)
  if (exportJobId) {
    const job = input.db
      .select()
      .from(exportJobs)
      .where(and(
        eq(exportJobs.id, exportJobId),
        eq(exportJobs.projectId, input.projectId),
      ))
      .get()
    assertRuntimeEntityExists({ label: "export", exists: Boolean(job) })
  }
}

function getCommentLine(input: {
  db: Db
  projectId: string
  commentThreadId?: string | null
}): string | null {
  if (!input.commentThreadId) return null
  const thread = input.db
    .select()
    .from(commentThreads)
    .where(and(
      eq(commentThreads.id, input.commentThreadId),
      eq(commentThreads.projectId, input.projectId),
    ))
    .get()
  if (!thread) return null
  const anchor =
    thread.anchorType === "element" && thread.elementSelector
      ? `element ${thread.elementSelector}`
      : thread.anchorType === "range"
        ? `frames ${thread.startFrame}-${thread.endFrame ?? thread.startFrame}`
        : `frame ${thread.startFrame}`
  return `- Comment anchor: ${anchor}`
}

export function appendRuntimeContextToPrompt(input: {
  prompt: string
  context: string | null
}): string {
  if (!input.context) return input.prompt
  return `${input.prompt.trim()}\n\n${input.context}`.trim()
}

export function buildAgentRuntimeContextPrompt(input: {
  db: Db
  resolved: ResolvedWorkspaceContext
  runtime: AgentRuntimeContextInput
}): string | null {
  const runtimeContext = normalizeAgentRuntimeContextPayload(input.runtime.runtimeContext)
  validateRuntimeContext({
    db: input.db,
    projectId: input.resolved.project.id,
    runtimeContext,
  })
  const composition = getTargetComposition({
    db: input.db,
    resolved: input.resolved,
    runtimeContext,
  })
  const commentThreadId =
    runtimeContext?.commentThreadId ?? input.runtime.commentThreadId ?? null
  const revisionId =
    runtimeContext?.revisionId ?? input.runtime.revisionId ?? (
      input.resolved.targetType === "revision" ? input.resolved.targetId : null
    )
  const previewSource =
    runtimeContext?.previewSource ??
    (input.resolved.kind === "generated_change" && revisionId
      ? { kind: "comment-revision" as const, revisionId }
      : { kind: "main" as const })
  const exportLabel = getExportSourceLabel({
    db: input.db,
    projectId: input.resolved.project.id,
    exportJobId: runtimeContext?.exportJobId,
  })

  const lines = [
    "Ripple live context:",
    `- Project: ${input.resolved.project.name}`,
    composition
      ? `- Composition: ${composition.name} (${composition.filePath})`
      : null,
    `- Editing target: ${
      input.resolved.kind === "generated_change"
        ? "isolated comment revision"
        : input.resolved.kind === "chat_worktree"
          ? "isolated chat revision"
          : "Main"
    }`,
    previewSourceLabel(previewSource)
      ? `- Preview source: ${previewSourceLabel(previewSource)}`
      : null,
    runtimeContext?.previewTimeSeconds !== null &&
      runtimeContext?.previewTimeSeconds !== undefined
      ? `- Preview time: ${runtimeContext.previewTimeSeconds.toFixed(3)}s`
      : null,
    runtimeContext?.previewFrame !== null && runtimeContext?.previewFrame !== undefined
      ? `- Preview frame: ${runtimeContext.previewFrame}`
      : null,
    getCommentLine({
      db: input.db,
      projectId: input.resolved.project.id,
      commentThreadId,
    }),
    revisionId ? `- Revision: ${revisionId}` : null,
    exportLabel ? `- Export: ${exportLabel}` : null,
    "",
    "Use this live context to target the current Ripple/HyperFrames work. Keep mutable state out of AGENTS.md and CLAUDE.md.",
  ].filter((line): line is string => line !== null)

  return lines.length > 2 ? lines.join("\n") : null
}
