import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import simpleGit from "simple-git"
import {
  getRippleRevisionPreviewProjectId,
  msToSeconds,
  normalizeCommentAnchor,
  type RippleCommentAnchorInput,
  type RippleCommentFilter,
  type RippleCommentThreadView,
  type RippleRevisionDiffSummary,
} from "../../../shared/ripple-comments"
import {
  summarizeRippleActivity,
  type RippleActivitySummary,
} from "../../../shared/ripple-activity"
import {
  validateAgentRuntimeAttachments,
  type AgentRuntimeAttachment,
} from "../../../shared/agent-runtime-attachments"
import {
  agentRunEvents,
  commentMessages,
  commentThreads,
  conversationMessages,
  conversations,
  compositions,
  getDatabase,
  projects,
  revisions,
  type Composition,
  type CommentThread,
  type Project,
  type Revision,
} from "../db"
import { inferAgentProviderFromModel } from "../agent-runtime/provider-selection"
import type { AgentProviderId } from "../agent-runtime/types"
import {
  appendConversationMessage,
  ensureCommentConversation,
  getConversationMessagesJson,
} from "../conversations/service"
import { createId } from "../db/utils"
import {
  createWorktreeForChat,
  hasOriginRemote,
  removeWorktree,
  sanitizeProjectName,
} from "../git"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { ensureRippleProjectGitRepository } from "../ripple-projects/project-git"
import {
  compactOneLineSummary,
  extractAssistantFinalResponseFromMessages,
} from "./comment-summary"
import { buildRevisionPrompt } from "./comment-prompt"
import {
  buildRevisionProposalPatch,
  refreshRevisionProposalFromLatest,
  resolveRevisionProjectPath,
} from "./revision-acceptance"
import { acceptIsolatedWorkspace } from "./isolated-workspace-acceptance"
import { captureCommentVisualForAnchor } from "./comment-visuals"
import { shouldCaptureCommentVisualContext } from "./comment-visual-policy"
import { markStaleProjectRevisionsUpdating } from "./revision-staleness"
import { canReuseRevisionAsFollowUpBase } from "./revision-follow-up-policy"
import { extractRevisionRunActivityLine } from "./revision-activity"

type Db = ReturnType<typeof getDatabase>

const RUNNING_REVISION_STATUSES = ["queued", "preparing", "running", "updating"] as const
const LIVE_AGENT_ACTIVITY_STATUSES = new Set(["queued", "preparing", "running"])
export const MAIN_CONFLICT_RESOLUTION_PROMPT = "Pull and Resolve from Main"

export interface CreateCommentThreadInput {
  projectId: string
  compositionId?: string | null
  body: string
  anchor: RippleCommentAnchorInput
  attachments?: AgentRuntimeAttachment[]
  createRevision?: boolean
  agentProvider?: AgentProviderId
  model?: string
  clientRequestId?: string | null
  sourceRevisionId?: string | null
  captureVisualContext?: boolean
}

export interface AddCommentReplyInput {
  threadId: string
  body: string
  attachments?: AgentRuntimeAttachment[]
  createRevision?: boolean
  agentProvider?: AgentProviderId
  model?: string
  clientRequestId?: string | null
}

function dateNow(): Date {
  return new Date()
}

function timecodeFromMs(value: number): string {
  const totalFrames = Math.max(0, Math.round((value / 1000) * 30))
  const frames = totalFrames % 30
  const totalSeconds = Math.floor(totalFrames / 30)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds, frames]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
}

function assertBody(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) {
    throw new Error("Write a comment before sending it.")
  }
  if (trimmed.length > 10_000) {
    throw new Error("Comment is too long.")
  }
  return trimmed
}

function assertAttachments(attachments: AgentRuntimeAttachment[] | null | undefined): void {
  const message = validateAgentRuntimeAttachments(attachments ?? [])
  if (message) throw new Error(message)
}

function normalizeClientRequestId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.length > 128) {
    throw new Error("Comment request id is too long.")
  }
  return trimmed
}

function serializeCommentMessageMetadata(
  attachments: AgentRuntimeAttachment[] | null | undefined,
): string | null {
  if (!attachments?.length) return null
  return JSON.stringify({
    attachments: attachments.map((attachment) => ({
      type: attachment.type,
      filename: attachment.filename ?? (attachment.type === "image" ? "image" : "file"),
      mediaType: attachment.mediaType ?? null,
      size: attachment.size ?? null,
    })),
  })
}

function shouldUseE2EFakeAgent(): boolean {
  return process.env.RIPPLE_E2E === "1" && !process.env.RIPPLE_E2E_LIVE_AGENT_HOME
}

function selectRevisionAgentProvider(input: {
  agentProvider?: AgentProviderId
  model?: string | null
  fallbackProvider?: AgentProviderId | null
}): AgentProviderId {
  if (shouldUseE2EFakeAgent()) return "fake"
  return input.agentProvider ??
    input.fallbackProvider ??
    inferAgentProviderFromModel(input.model)
}

function selectRevisionAgentModel(input: {
  model?: string | null
  fallbackModel?: string | null
}): string | null {
  if (shouldUseE2EFakeAgent()) return "fake-agent"
  return input.model ?? input.fallbackModel ?? null
}

function getProject(db: Db, projectId: string): Project {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) throw new Error("Project not found.")
  if (project.archivedAt) {
    throw new Error("Restore this project before leaving comments.")
  }
  return project
}

function assertComposition(db: Db, projectId: string, compositionId?: string | null): void {
  if (!compositionId) return
  const composition = db
    .select({ id: compositions.id })
    .from(compositions)
    .where(and(eq(compositions.id, compositionId), eq(compositions.projectId, projectId)))
    .get()
  if (!composition) throw new Error("Composition not found for this project.")
}

function diffSummaryFromPatch(diff: string): RippleRevisionDiffSummary {
  const files: string[] = []
  let additions = 0
  let deletions = 0

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
      if (match?.[2]) files.push(match[2])
      continue
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) additions += 1
    else if (line.startsWith("-")) deletions += 1
  }

  return {
    fileCount: new Set(files).size,
    additions,
    deletions,
    files: Array.from(new Set(files)).slice(0, 50),
  }
}

function serializeDiffSummary(summary: RippleRevisionDiffSummary): string {
  return JSON.stringify(summary)
}

function parseStoredDiffSummary(
  value: string | null | undefined,
): RippleRevisionDiffSummary | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<RippleRevisionDiffSummary>
    return {
      fileCount: Number(parsed.fileCount ?? 0),
      additions: Number(parsed.additions ?? 0),
      deletions: Number(parsed.deletions ?? 0),
      files: Array.isArray(parsed.files)
        ? parsed.files.filter((file): file is string => typeof file === "string")
        : [],
      ...(typeof parsed.summary === "string" && parsed.summary.trim()
        ? { summary: parsed.summary.trim() }
        : {}),
    }
  } catch {
    return null
  }
}

function parseConversationMessageParts(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getRevisionDiffSummaryForView(
  db: ReturnType<typeof getDatabase>,
  revision: Revision,
): string | null {
  const liveActivity = getRevisionRunActivitySummaryForView(db, revision)
  if (liveActivity) return liveActivity

  const summary = parseStoredDiffSummary(revision.diffSummary)
  if (!summary || !revision.conversationId) return revision.diffSummary
  if (summary.summary?.trim()) return revision.diffSummary

  const messages = revision.agentRunId
    ? db
      .select()
      .from(conversationMessages)
      .where(and(
        eq(conversationMessages.conversationId, revision.conversationId),
        eq(conversationMessages.agentRunId, revision.agentRunId),
      ))
      .orderBy(asc(conversationMessages.createdAt))
      .all()
    : []
  const assistantSummary = extractAssistantFinalResponseFromMessages(
    messages.length > 0
      ? JSON.stringify(messages.map((message) => ({
        role: message.role,
        parts: parseConversationMessageParts(message.partsJson),
      })))
      : getConversationMessagesJson(revision.conversationId, db),
  )
  if (!assistantSummary) return revision.diffSummary
  return serializeDiffSummary({ ...summary, summary: assistantSummary })
}

function getRevisionRunActivitySummaryForView(
  db: ReturnType<typeof getDatabase>,
  revision: Revision,
): string | null {
  if (!revision.agentRunId || !LIVE_AGENT_ACTIVITY_STATUSES.has(revision.status)) {
    return null
  }

  const activity = extractRevisionRunActivityLine(
    db
      .select()
      .from(agentRunEvents)
      .where(eq(agentRunEvents.agentRunId, revision.agentRunId))
      .orderBy(asc(agentRunEvents.sequence))
      .all(),
  )
  if (!activity) return null

  const summary = parseStoredDiffSummary(revision.diffSummary) ?? {
    fileCount: 0,
    additions: 0,
    deletions: 0,
    files: [],
  }
  return serializeDiffSummary({ ...summary, summary: activity })
}

function attachRevisionToCommentMessage(input: {
  db: Db
  messageId?: string | null
  threadId: string
  revisionId: string
}): void {
  if (!input.messageId) return
  input.db.update(commentMessages)
    .set({ revisionId: input.revisionId })
    .where(and(
      eq(commentMessages.id, input.messageId),
      eq(commentMessages.threadId, input.threadId),
    ))
    .run()

  const conversation = input.db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.commentThreadId, input.threadId))
    .get()
  if (!conversation) return

  const rows = input.db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversation.id))
    .all()
  for (const row of rows) {
    let metadata: Record<string, unknown>
    try {
      const parsed = JSON.parse(row.metadataJson || "{}")
      metadata = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {}
    } catch {
      metadata = {}
    }
    if (
      metadata.source !== "ripple-comment" ||
      metadata.commentMessageId !== input.messageId
    ) {
      continue
    }
    input.db.update(conversationMessages)
      .set({
        metadataJson: JSON.stringify({
          ...metadata,
          revisionId: input.revisionId,
        }),
      })
      .where(eq(conversationMessages.id, row.id))
      .run()
  }
}

function appendCommentUserConversationMessage(input: {
  db: Db
  thread: CommentThread
  body: string
  messageId: string
  attachments?: AgentRuntimeAttachment[]
  clientRequestId?: string | null
}): void {
  const conversation = ensureCommentConversation({
    db: input.db,
    thread: input.thread,
    title: `Comment ${timecodeFromMs(input.thread.startTime)}`,
  })
  const parts: Record<string, unknown>[] = [{ type: "text", text: input.body }]
  for (const attachment of input.attachments ?? []) {
    if (attachment.type === "image") {
      parts.push({
        type: "data-image",
        data: {
          base64Data: attachment.base64Data,
          mediaType: attachment.mediaType,
          filename: attachment.filename ?? "image",
        },
      })
    } else {
      parts.push({
        type: "data-file",
        data: {
          base64Data: attachment.base64Data,
          mediaType: attachment.mediaType,
          filename: attachment.filename,
          size: attachment.size,
        },
      })
    }
  }
  appendConversationMessage({
    db: input.db,
    conversationId: conversation.id,
    role: "user",
    body: input.body,
    parts,
    metadata: {
      source: "ripple-comment",
      threadId: input.thread.id,
      commentMessageId: input.messageId,
      clientRequestId: input.clientRequestId ?? null,
    },
  })
}

function captureCommentVisualContextInBackground(input: {
  project: Project
  composition: Composition | null
  anchor: RippleCommentAnchorInput
  threadId: string
  sourceRevisionId?: string | null
}): void {
  void (async () => {
    try {
      const db = getDatabase()
      const visual = await captureCommentVisualForAnchor({
        db,
        project: input.project,
        composition: input.composition,
        anchor: input.anchor,
        threadId: input.threadId,
        sourceRevisionId: input.sourceRevisionId,
      })
      if (!visual?.relativePath) return

      db.update(commentThreads)
        .set({
          screenshotPath: visual.relativePath,
          updatedAt: dateNow(),
        })
        .where(and(
          eq(commentThreads.id, input.threadId),
          isNull(commentThreads.screenshotPath),
        ))
        .run()
    } catch (error) {
      console.warn("[Ripple] Could not capture comment visual context:", error)
    }
  })()
}

function createRevisionForThreadInBackground(input: Parameters<typeof createRevisionForThread>[0]) {
  void createRevisionForThread(input)
    .then((revision) =>
      import("../agent-runtime/generated-change-scheduler")
        .then(({ scheduleGeneratedChangeQueue }) => {
          scheduleGeneratedChangeQueue({ projectId: revision.projectId })
        }),
    )
    .catch((error) => {
      console.warn("[Ripple] Could not start comment revision:", error)
    })
}

async function prepareMissingRevisionWorkspaceForRecovery(input: {
  db: Db
  revision: Revision
  project: Project
}): Promise<Revision> {
  const { db, revision, project } = input

  if (!revision.conversationId) {
    throw new Error("The generated change chat is not available.")
  }

  const recoveryPrompt = `${revision.prompt}\n\nrecovery: rebuild the missing generated-change workspace before accepting.`
  const recoveryMessage =
    "Ripple is recovering this generated change before it can be accepted."
  const preparingAt = dateNow()
  db.update(revisions)
    .set({
      status: "preparing",
      errorMessage: recoveryMessage,
      prompt: recoveryPrompt,
      updatedAt: preparingAt,
    })
    .where(eq(revisions.id, revision.id))
    .run()

  try {
    const projectPath = resolveRevisionProjectPath(project)
    const base = await ensureRippleProjectGitRepository(projectPath)
    const branchType = await hasOriginRemote(base.projectPath) ? undefined : "local"
    const result = await createWorktreeForChat(
      base.projectPath,
      sanitizeProjectName(project.name),
      revision.id,
      undefined,
      branchType,
    )
    const contextPath = result.worktreePath ? resolve(result.worktreePath) : null
    if (
      !result.success ||
      !contextPath ||
      contextPath === base.projectPath ||
      isPathInsideDirectory(base.projectPath, contextPath)
    ) {
      throw new Error(
        result.error ||
          "Ripple could not prepare a temporary workspace for this generated change.",
      )
    }

    return db.transaction(() => {
      const now = dateNow()
      const recoveredRevision = db.update(revisions)
        .set({
          contextPath,
          branch: result.branch ?? null,
          baseProjectCommit: base.baseCommit,
          status: "queued",
          errorMessage: recoveryMessage,
          prompt: recoveryPrompt,
          previewContextKey:
            revision.previewContextKey ??
            getRippleRevisionPreviewProjectId(revision.id),
          updatedAt: now,
          resolvedAt: null,
        })
        .where(eq(revisions.id, revision.id))
        .returning()
        .get()
      db.update(conversations)
        .set({
          revisionId: recoveredRevision.id,
          worktreePath: contextPath,
          branch: result.branch ?? null,
          baseBranch: result.baseBranch ?? null,
          updatedAt: now,
        })
        .where(eq(conversations.id, revision.conversationId!))
        .run()
      db.update(commentThreads)
        .set({ latestRevisionId: recoveredRevision.id, updatedAt: now })
        .where(eq(commentThreads.id, revision.threadId))
        .run()
      return recoveredRevision
    })
  } catch (error) {
    const errorMessage = compactOneLineSummary(
      error instanceof Error ? error.message : String(error),
    ) || "Ripple could not recover this generated change."
    return db.update(revisions)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: dateNow(),
        resolvedAt: dateNow(),
      })
      .where(eq(revisions.id, revision.id))
      .returning()
      .get()
  }
}

function updateCommentConversationStatus(input: {
  db: Db
  threadId: string
  status: "open" | "resolved" | "deleted"
  deletedAt?: Date | null
}): void {
  input.db.update(conversations)
    .set({
      status: input.status,
      deletedAt: input.deletedAt,
      archivedAt: null,
      updatedAt: dateNow(),
    })
    .where(eq(conversations.commentThreadId, input.threadId))
    .run()
}

function getCompositionForPrompt(
  db: Db,
  compositionId: string | null | undefined,
): Composition | null {
  if (!compositionId) return null
  return db
    .select()
    .from(compositions)
    .where(eq(compositions.id, compositionId))
    .get() ?? null
}

async function loadThreadView(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")

  const messages = db
    .select()
    .from(commentMessages)
    .where(eq(commentMessages.threadId, thread.id))
    .orderBy(asc(commentMessages.createdAt))
    .all()

  const revisionRows = db
    .select()
    .from(revisions)
    .where(eq(revisions.threadId, thread.id))
    .orderBy(asc(revisions.createdAt))
    .all()

  return {
    ...thread,
    messages,
    revisions: revisionRows.map((revision) => ({
      id: revision.id,
      threadId: revision.threadId,
      projectId: revision.projectId,
      compositionId: revision.compositionId,
      conversationId: revision.conversationId,
      chatId: revision.chatId,
      subChatId: revision.subChatId,
      status: revision.status,
      previewContextKey: revision.previewContextKey,
      diffSummary: getRevisionDiffSummaryForView(db, revision),
      errorMessage: revision.errorMessage,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
      resolvedAt: revision.resolvedAt,
    })),
  }
}

export async function listCommentThreads(input: {
  projectId: string
  compositionId?: string | null
  filter?: RippleCommentFilter
}): Promise<RippleCommentThreadView[]> {
  const db = getDatabase()
  getProject(db, input.projectId)

  const filter = input.filter ?? "active"
  const conditions = [eq(commentThreads.projectId, input.projectId)]
  if (input.compositionId) {
    conditions.push(eq(commentThreads.compositionId, input.compositionId))
  }
  if (filter === "deleted") {
    conditions.push(isNotNull(commentThreads.deletedAt))
  } else {
    conditions.push(isNull(commentThreads.deletedAt))
    if (filter === "active") {
      conditions.push(eq(commentThreads.status, "open"))
    } else if (filter === "resolved") {
      conditions.push(eq(commentThreads.status, "resolved"))
    }
  }

  const threads = db
    .select()
    .from(commentThreads)
    .where(and(...conditions))
    .orderBy(desc(commentThreads.updatedAt))
    .all()

  return Promise.all(threads.map((thread) => loadThreadView(thread.id)))
}

export function listCommentActivitySummary(input: {
  projectId: string
}): RippleActivitySummary[] {
  const db = getDatabase()
  getProject(db, input.projectId)

  const threads = db
    .select({
      id: commentThreads.id,
      projectId: commentThreads.projectId,
      compositionId: commentThreads.compositionId,
      status: commentThreads.status,
      latestRevisionId: commentThreads.latestRevisionId,
      updatedAt: commentThreads.updatedAt,
    })
    .from(commentThreads)
    .where(and(
      eq(commentThreads.projectId, input.projectId),
      isNull(commentThreads.deletedAt),
      isNotNull(commentThreads.compositionId),
    ))
    .all()

  const latestRevisionIds = threads
    .map((thread) => thread.latestRevisionId)
    .filter((id): id is string => Boolean(id))
  const revisionRows = latestRevisionIds.length > 0
    ? db
      .select({
        id: revisions.id,
        status: revisions.status,
        updatedAt: revisions.updatedAt,
      })
      .from(revisions)
      .where(inArray(revisions.id, latestRevisionIds))
      .all()
    : []
  const revisionsById = new Map(revisionRows.map((revision) => [
    revision.id,
    revision,
  ]))

  return summarizeRippleActivity(
    threads.flatMap((thread) => {
      if (!thread.compositionId) return []
      const revision = thread.latestRevisionId
        ? revisionsById.get(thread.latestRevisionId) ?? null
        : null
      return [{
        projectId: thread.projectId,
        scopeKind: "composition" as const,
        scopeId: thread.compositionId,
        threadStatus: thread.status,
        threadUpdatedAt: thread.updatedAt,
        latestRevisionStatus: revision?.status ?? null,
        latestRevisionUpdatedAt: revision?.updatedAt ?? null,
      }]
    }),
  )
}

export async function createCommentThread(
  input: CreateCommentThreadInput,
): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const project = getProject(db, input.projectId)
  assertComposition(db, input.projectId, input.compositionId)
  const composition = getCompositionForPrompt(db, input.compositionId)

  const body = assertBody(input.body)
  assertAttachments(input.attachments)
  const clientRequestId = normalizeClientRequestId(input.clientRequestId)
  if (clientRequestId) {
    const existingThread = db
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(and(
        eq(commentThreads.projectId, input.projectId),
        eq(commentThreads.clientRequestId, clientRequestId),
      ))
      .get()
    if (existingThread) {
      return loadThreadView(existingThread.id)
    }
  }
  const anchor = normalizeCommentAnchor(input.anchor)
  const now = dateNow()
  const threadId = createId()
  const messageId = createId()
  const thread = db.transaction(() => {
    const createdThread = db
      .insert(commentThreads)
      .values({
        id: threadId,
        projectId: input.projectId,
        compositionId: input.compositionId ?? null,
        anchorType: anchor.anchorType,
        startTime: anchor.startTimeMs,
        endTime: anchor.endTimeMs,
        startFrame: anchor.startFrame,
        endFrame: anchor.endFrame,
        elementSelector: anchor.elementSelector,
        clipKey: anchor.clipKey,
        sourceFile: anchor.sourceFile,
        screenshotPath: anchor.screenshotPath,
        clientRequestId,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()

    db.insert(commentMessages)
      .values({
        id: messageId,
        threadId: createdThread.id,
        role: "user",
        body,
        metadataJson: serializeCommentMessageMetadata(input.attachments),
        clientRequestId,
        createdAt: now,
      })
      .run()

    return createdThread
  })
  appendCommentUserConversationMessage({
    db,
    thread,
    body,
    messageId,
    attachments: input.attachments,
    clientRequestId,
  })

  if (shouldCaptureCommentVisualContext({
    captureVisualContext: input.captureVisualContext,
    screenshotPath: anchor.screenshotPath,
  })) {
    captureCommentVisualContextInBackground({
      project,
      composition,
      anchor: input.anchor,
      threadId: thread.id,
      sourceRevisionId: input.sourceRevisionId,
    })
  }

  if (input.createRevision ?? true) {
    createRevisionForThreadInBackground({
      threadId: thread.id,
      body,
      project,
      messageId,
      attachments: input.attachments,
      agentProvider: input.agentProvider,
      model: input.model,
    })
  }

  return loadThreadView(thread.id)
}

export async function addCommentReply(
  input: AddCommentReplyInput,
): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, input.threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")
  if (thread.deletedAt) {
    throw new Error("Restore this comment before replying.")
  }
  if (thread.status === "resolved") {
    throw new Error("Accepted comments are locked as history.")
  }
  const project = getProject(db, thread.projectId)
  const body = assertBody(input.body)
  assertAttachments(input.attachments)
  const clientRequestId = normalizeClientRequestId(input.clientRequestId)
  if (clientRequestId) {
    const existingMessage = db
      .select({ id: commentMessages.id })
      .from(commentMessages)
      .where(and(
        eq(commentMessages.threadId, thread.id),
        eq(commentMessages.clientRequestId, clientRequestId),
      ))
      .get()
    if (existingMessage) {
      return loadThreadView(thread.id)
    }
  }
  const now = dateNow()
  const messageId = createId()

  db.transaction(() => {
    db.insert(commentMessages)
      .values({
        id: messageId,
        threadId: thread.id,
        role: "user",
        body,
        metadataJson: serializeCommentMessageMetadata(input.attachments),
        clientRequestId,
        createdAt: now,
      })
      .run()
    db.update(commentThreads)
      .set({ status: "open", updatedAt: now, resolvedAt: null })
      .where(eq(commentThreads.id, thread.id))
      .run()
  })
  appendCommentUserConversationMessage({
    db,
    thread,
    body,
    messageId,
    attachments: input.attachments,
    clientRequestId,
  })

  if (input.createRevision ?? true) {
    await createRevisionForThread({
      threadId: thread.id,
      body,
      project,
      baseRevisionId: thread.latestRevisionId,
      messageId,
      attachments: input.attachments,
      agentProvider: input.agentProvider,
      model: input.model,
    })
  }

  return loadThreadView(thread.id)
}

export async function createRevisionForThread(input: {
  threadId: string
  body: string
  project?: Project
  baseRevisionId?: string | null
  messageId?: string | null
  attachments?: AgentRuntimeAttachment[]
  agentProvider?: AgentProviderId
  model?: string
}): Promise<Revision> {
  const db = getDatabase()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, input.threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")
  if (thread.deletedAt) {
    throw new Error("Restore this comment before creating changes.")
  }
  if (thread.status === "resolved") {
    throw new Error("Accepted comments are locked as history.")
  }
  assertAttachments(input.attachments)
  const project = input.project ?? getProject(db, thread.projectId)
  const composition = getCompositionForPrompt(db, thread.compositionId)
  const chatName = `Comment ${timecodeFromMs(thread.startTime)}`
  const conversation = ensureCommentConversation({
    db,
    thread,
    title: chatName,
  })
  const prompt = buildRevisionPrompt({
    thread,
    body: input.body,
    project,
    composition,
  })
  const now = dateNow()
  const revisionId = createId()
  const baseRevision = input.baseRevisionId
    ? db.select().from(revisions).where(eq(revisions.id, input.baseRevisionId)).get()
    : null
  const reusableBaseRevision =
    baseRevision &&
    baseRevision.threadId === thread.id &&
    baseRevision.projectId === project.id &&
    baseRevision.contextPath &&
    canReuseRevisionAsFollowUpBase(baseRevision.status)
      ? baseRevision
      : null

  if (reusableBaseRevision) {
    try {
      await stat(reusableBaseRevision.contextPath!)
    } catch (error) {
      const message = compactOneLineSummary(
        error instanceof Error ? error.message : String(error),
      ) || "The previous generated-change workspace is not available."
      return db.transaction(() => {
        const failedRevision = db
          .insert(revisions)
          .values({
            id: revisionId,
            threadId: thread.id,
            projectId: project.id,
            compositionId: thread.compositionId,
            conversationId: conversation.id,
            chatId: null,
            subChatId: null,
            agentProvider: selectRevisionAgentProvider({
              agentProvider: input.agentProvider,
              model: input.model,
              fallbackProvider: reusableBaseRevision.agentProvider,
            }),
            agentModel: selectRevisionAgentModel({
              model: input.model,
              fallbackModel: reusableBaseRevision.agentModel,
            }),
            baseRevisionId: reusableBaseRevision.id,
            baseProjectCommit: reusableBaseRevision.baseProjectCommit,
            baseProjectHash: reusableBaseRevision.baseProjectHash,
            contextPath: reusableBaseRevision.contextPath,
            branch: reusableBaseRevision.branch,
            prompt,
            status: "failed",
            errorMessage: message,
            previewContextKey: getRippleRevisionPreviewProjectId(revisionId),
            createdAt: now,
            updatedAt: now,
            resolvedAt: now,
          })
          .returning()
          .get()
        attachRevisionToCommentMessage({
          db,
          messageId: input.messageId,
          threadId: thread.id,
          revisionId: failedRevision.id,
        })
        db.update(commentThreads)
          .set({ latestRevisionId: failedRevision.id, updatedAt: now })
          .where(eq(commentThreads.id, thread.id))
          .run()
        db.insert(commentMessages)
          .values({
            threadId: thread.id,
            revisionId: failedRevision.id,
            role: "system",
            body: message,
            createdAt: now,
          })
          .run()
        return failedRevision
      })
    }

    const revision = db.transaction(() => {
      const createdRevision = db
        .insert(revisions)
        .values({
          id: revisionId,
          threadId: thread.id,
          projectId: project.id,
          compositionId: thread.compositionId,
          conversationId: conversation.id,
          chatId: null,
          subChatId: null,
          agentProvider: selectRevisionAgentProvider({
            agentProvider: input.agentProvider,
            model: input.model,
            fallbackProvider: reusableBaseRevision.agentProvider,
          }),
          agentModel: selectRevisionAgentModel({
            model: input.model,
            fallbackModel: reusableBaseRevision.agentModel,
          }),
          baseRevisionId: reusableBaseRevision.id,
          baseProjectCommit: reusableBaseRevision.baseProjectCommit,
          baseProjectHash: reusableBaseRevision.baseProjectHash,
          contextPath: reusableBaseRevision.contextPath,
          branch: reusableBaseRevision.branch,
          prompt,
          status: "queued",
          previewContextKey: getRippleRevisionPreviewProjectId(revisionId),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()

      db.update(conversations)
        .set({
          revisionId: createdRevision.id,
          worktreePath: reusableBaseRevision.contextPath,
          branch: reusableBaseRevision.branch,
          updatedAt: now,
        })
        .where(eq(conversations.id, conversation.id))
        .run()
      if (
        reusableBaseRevision.status === "proposed" ||
        reusableBaseRevision.status === "answered" ||
        reusableBaseRevision.status === "failed" ||
        reusableBaseRevision.status === "queued" ||
        reusableBaseRevision.status === "preparing" ||
        reusableBaseRevision.status === "updating"
      ) {
        db.update(revisions)
          .set({ status: "superseded", updatedAt: now })
          .where(eq(revisions.id, reusableBaseRevision.id))
          .run()
      }
      attachRevisionToCommentMessage({
        db,
        messageId: input.messageId,
        threadId: thread.id,
        revisionId: createdRevision.id,
      })
      db.update(commentThreads)
        .set({ latestRevisionId: createdRevision.id, updatedAt: now })
        .where(eq(commentThreads.id, thread.id))
        .run()

      return createdRevision
    })

    return revision
  }

  let revision = db.transaction(() => {
    const createdRevision = db
      .insert(revisions)
      .values({
        id: revisionId,
        threadId: thread.id,
        projectId: project.id,
        compositionId: thread.compositionId,
        conversationId: conversation.id,
        chatId: null,
        subChatId: null,
        agentProvider: selectRevisionAgentProvider({
          agentProvider: input.agentProvider,
          model: input.model,
        }),
        agentModel: selectRevisionAgentModel({ model: input.model }),
        baseRevisionId: input.baseRevisionId ?? null,
        prompt,
        status: "preparing",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    attachRevisionToCommentMessage({
      db,
      messageId: input.messageId,
      threadId: thread.id,
      revisionId: createdRevision.id,
    })
      db.update(conversations)
        .set({ revisionId: createdRevision.id, updatedAt: now })
        .where(eq(conversations.id, conversation.id))
        .run()

    return createdRevision
  })

  try {
    const projectPath = resolveRevisionProjectPath(project)
    const base = await ensureRippleProjectGitRepository(projectPath)
    const branchType = await hasOriginRemote(base.projectPath) ? undefined : "local"
    const result = await createWorktreeForChat(
      base.projectPath,
      sanitizeProjectName(project.name),
      revisionId,
      undefined,
      branchType,
    )

    const contextPath = result.worktreePath ? resolve(result.worktreePath) : null
    if (
      !result.success ||
      !contextPath ||
      contextPath === base.projectPath ||
      isPathInsideDirectory(base.projectPath, contextPath)
    ) {
      throw new Error(
        result.error ||
          "Ripple could not prepare a temporary workspace for this comment.",
      )
    }

    const previewContextKey = getRippleRevisionPreviewProjectId(revision.id)
    revision = db.transaction(() => {
      const updatedRevision = db
        .update(revisions)
        .set({
          contextPath,
          branch: result.branch ?? null,
          baseProjectCommit: base.baseCommit,
          status: "queued",
          previewContextKey,
          updatedAt: dateNow(),
        })
        .where(eq(revisions.id, revision.id))
        .returning()
        .get()
      db.update(conversations)
        .set({
          revisionId: updatedRevision.id,
          worktreePath: contextPath,
          branch: result.branch ?? null,
          baseBranch: result.baseBranch ?? null,
          updatedAt: dateNow(),
        })
        .where(eq(conversations.id, conversation.id))
        .run()
      db.update(commentThreads)
        .set({ latestRevisionId: updatedRevision.id, updatedAt: dateNow() })
        .where(eq(commentThreads.id, thread.id))
        .run()
      return updatedRevision
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    revision = db.transaction(() => {
      const failedRevision = db
        .update(revisions)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: dateNow(),
          resolvedAt: dateNow(),
        })
        .where(eq(revisions.id, revision.id))
        .returning()
        .get()
      db.update(commentThreads)
        .set({ latestRevisionId: failedRevision.id, updatedAt: dateNow() })
        .where(eq(commentThreads.id, thread.id))
        .run()
      db.insert(commentMessages)
        .values({
          threadId: thread.id,
          revisionId: failedRevision.id,
          role: "system",
          body: message,
          createdAt: dateNow(),
        })
        .run()
      return failedRevision
    })
  }

  return revision
}

async function cleanupRevisionWorkspaces(input: {
  db: Db
  revisions: Revision[]
  includeAccepted?: boolean
}): Promise<Map<string, string | null>> {
  const projectsById = new Map<string, Project>()
  const cleanedContexts = new Map<string, string | null>()

  for (const revision of input.revisions) {
    if (!input.includeAccepted && revision.status === "accepted") continue
    if (!revision.contextPath) continue

    const contextKey = resolve(revision.contextPath)
    if (cleanedContexts.has(contextKey)) continue
    cleanedContexts.set(contextKey, null)

    let project = projectsById.get(revision.projectId)
    if (!project) {
      project = input.db
        .select()
        .from(projects)
        .where(eq(projects.id, revision.projectId))
        .get()
      if (project) projectsById.set(revision.projectId, project)
    }

    if (!project) {
      cleanedContexts.set(contextKey, "Project not found.")
      continue
    }

    try {
      await stat(contextKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      cleanedContexts.set(
        contextKey,
        error instanceof Error ? error.message : "Workspace cleanup failed.",
      )
      continue
    }

    const cleanup = await removeWorktree(
      resolveRevisionProjectPath(project),
      contextKey,
    )
    cleanedContexts.set(
      contextKey,
      cleanup.success ? null : cleanup.error ?? "Cleanup failed.",
    )
  }

  return cleanedContexts
}

function revisionCleanupError(
  cleanupErrors: Map<string, string | null>,
  revision: Revision,
): string | null {
  return revision.contextPath
    ? cleanupErrors.get(resolve(revision.contextPath)) ?? null
    : null
}

function throwIfThreadHasRunningRevision(revisionsForThread: Revision[]): void {
  const activeRevision = revisionsForThread.find((revision) =>
    (RUNNING_REVISION_STATUSES as readonly string[]).includes(revision.status),
  )
  if (activeRevision) {
    throw new Error("Wait for generated changes to finish before deleting this comment.")
  }
}

function throwIfAcceptedThreadHistory(
  thread: CommentThread,
  revisionsForThread: Revision[],
): void {
  if (
    thread.status === "resolved" ||
    revisionsForThread.some((revision) => revision.status === "accepted")
  ) {
    throw new Error("Accepted comments are locked as history.")
  }
}

export async function rejectCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const now = dateNow()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")
  const threadRevisions = db
    .select()
    .from(revisions)
    .where(eq(revisions.threadId, threadId))
    .all()
  throwIfAcceptedThreadHistory(thread, threadRevisions)
  throwIfThreadHasRunningRevision(threadRevisions)
  const cleanupErrors = await cleanupRevisionWorkspaces({
    db,
    revisions: threadRevisions,
  })

  for (const revision of threadRevisions) {
    if (revision.status === "accepted") continue

    db.update(revisions)
      .set({
        status: "rejected",
        errorMessage: revisionCleanupError(cleanupErrors, revision),
        updatedAt: now,
        resolvedAt: now,
      })
      .where(eq(revisions.id, revision.id))
      .run()
  }

  db.update(commentThreads)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(commentThreads.id, threadId))
    .run()
  updateCommentConversationStatus({
    db,
    threadId,
    status: "deleted",
    deletedAt: now,
  })
  return loadThreadView(threadId)
}

export async function deleteCommentThread(threadId: string): Promise<void> {
  const db = getDatabase()
  const now = dateNow()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")

  const threadRevisions = db
    .select()
    .from(revisions)
    .where(eq(revisions.threadId, threadId))
    .all()
  throwIfAcceptedThreadHistory(thread, threadRevisions)

  db.transaction(() => {
    db.update(commentThreads)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(commentThreads.id, threadId))
      .run()
    updateCommentConversationStatus({
      db,
      threadId,
      status: "deleted",
      deletedAt: now,
    })
  })
}

export async function restoreCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const now = dateNow()
  db.update(commentThreads)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(commentThreads.id, threadId))
    .run()
  updateCommentConversationStatus({
    db,
    threadId,
    status: "open",
    deletedAt: null,
  })
  return loadThreadView(threadId)
}

export async function resolveCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const now = dateNow()
  db.update(commentThreads)
    .set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(eq(commentThreads.id, threadId))
    .run()
  updateCommentConversationStatus({
    db,
    threadId,
    status: "resolved",
    deletedAt: null,
  })
  return loadThreadView(threadId)
}

function requireRevision(id: string): { revision: Revision; project: Project } {
  const db = getDatabase()
  const revision = db.select().from(revisions).where(eq(revisions.id, id)).get()
  if (!revision) throw new Error("Changes not found.")
  const project = getProject(db, revision.projectId)
  return { revision, project }
}

export async function refreshRevisionProposal(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision } = requireRevision(id)
  if (!revision.contextPath) {
    throw new Error("The temporary workspace is not available.")
  }

  const diff = await buildRevisionProposalPatch({
    revisionPath: revision.contextPath,
    baseProjectCommit: revision.baseProjectCommit,
  })
  const summary = diffSummaryFromPatch(diff)
  const nextStatus = summary.fileCount > 0 ? "proposed" : "answered"
  db.update(revisions)
    .set({
      status: nextStatus,
      diffSummary: serializeDiffSummary(summary),
      updatedAt: dateNow(),
    })
    .where(eq(revisions.id, id))
    .run()

  return loadThreadView(revision.threadId)
}

export async function updateStaleRevisionProposal(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision, project } = requireRevision(id)
  if (revision.status === "needs_update") {
    const now = dateNow()
    db.update(revisions)
      .set({
        status: "updating",
        errorMessage: null,
        prompt: MAIN_CONFLICT_RESOLUTION_PROMPT,
        updatedAt: now,
      })
      .where(eq(revisions.id, id))
      .run()
    return loadThreadView(revision.threadId)
  }
  if (revision.status !== "updating") {
    return loadThreadView(revision.threadId)
  }
  if (revision.prompt === MAIN_CONFLICT_RESOLUTION_PROMPT) {
    return loadThreadView(revision.threadId)
  }
  if (!revision.contextPath) {
    throw new Error("The temporary workspace is not available.")
  }

  const projectPath = resolveRevisionProjectPath(project)
  const revisionPath = resolve(revision.contextPath)
  const projectStatus = await simpleGit(projectPath).status()
  if (!projectStatus.isClean()) {
    throw new Error("Wait for the latest accepted changes to finish saving.")
  }

  try {
    const refresh = await refreshRevisionProposalFromLatest({
      projectPath,
      revisionPath,
      baseProjectCommit: revision.baseProjectCommit,
    })
    const summary = diffSummaryFromPatch(refresh.summaryPatch)

    if (refresh.refreshed) {
      const nextStatus = summary.fileCount > 0 ? "proposed" : "answered"
      db.update(revisions)
        .set({
          status: nextStatus,
          baseProjectCommit: refresh.currentCommit,
          diffSummary: serializeDiffSummary(summary),
          errorMessage: null,
          updatedAt: dateNow(),
        })
        .where(eq(revisions.id, id))
        .run()
      return loadThreadView(revision.threadId)
    }

    const now = dateNow()
    db.update(revisions)
      .set({
        status: "updating",
        baseProjectCommit: refresh.currentCommit,
        diffSummary: serializeDiffSummary(summary),
        errorMessage: null,
        prompt: MAIN_CONFLICT_RESOLUTION_PROMPT,
        updatedAt: now,
      })
      .where(eq(revisions.id, id))
      .run()
  } catch (error) {
    db.update(revisions)
      .set({
        status: "failed",
        errorMessage: compactOneLineSummary(
          error instanceof Error ? error.message : String(error),
        ) || "Ripple could not update these changes.",
        updatedAt: dateNow(),
        resolvedAt: dateNow(),
      })
      .where(eq(revisions.id, id))
      .run()
  }

  return loadThreadView(revision.threadId)
}

export async function markRevisionRunning(id: string): Promise<{
  started: boolean
  thread: RippleCommentThreadView
}> {
  const db = getDatabase()
  const { revision } = requireRevision(id)
  if (
    revision.status === "accepted" ||
    revision.status === "rejected" ||
    revision.status === "superseded"
  ) {
    return {
      started: false,
      thread: await loadThreadView(revision.threadId),
    }
  }

  const startedRevision = db.update(revisions)
    .set({
      status: "running",
      errorMessage: null,
      updatedAt: dateNow(),
    })
    .where(and(
      eq(revisions.id, id),
      inArray(revisions.status, ["queued", "updating"]),
    ))
    .returning()
    .get()

  return {
    started: Boolean(startedRevision),
    thread: await loadThreadView(revision.threadId),
  }
}

export async function completeRevisionBackgroundRun(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision } = requireRevision(id)
  if (revision.status !== "running") {
    return loadThreadView(revision.threadId)
  }
  if (!revision.contextPath) {
    throw new Error("The temporary workspace is not available.")
  }

  const diff = await buildRevisionProposalPatch({
    revisionPath: revision.contextPath,
    baseProjectCommit: revision.baseProjectCommit,
  })
  const summary = diffSummaryFromPatch(diff)
  const assistantSummary = extractAssistantFinalResponseFromMessages(
    revision.conversationId
      ? getConversationMessagesJson(revision.conversationId, db)
      : null,
  )
  if (assistantSummary) {
    summary.summary = assistantSummary
  }

  const completedRevision = db.update(revisions)
    .set({
      status: summary.fileCount > 0 ? "proposed" : "answered",
      diffSummary: serializeDiffSummary(summary),
      errorMessage: null,
      updatedAt: dateNow(),
    })
    .where(and(eq(revisions.id, id), eq(revisions.status, "running")))
    .returning()
    .get()

  if (!completedRevision) {
    return loadThreadView(revision.threadId)
  }

  return loadThreadView(revision.threadId)
}

export async function failRevisionBackgroundRun(input: {
  revisionId: string
  errorMessage: string
}): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision } = requireRevision(input.revisionId)
  if (!(RUNNING_REVISION_STATUSES as readonly string[]).includes(revision.status)) {
    return loadThreadView(revision.threadId)
  }
  const message =
    compactOneLineSummary(input.errorMessage) ||
    "Agent run failed before changes were ready."

  const failedRevision = db.update(revisions)
    .set({
      status: "failed",
      errorMessage: message,
      updatedAt: dateNow(),
      resolvedAt: dateNow(),
    })
    .where(and(
      eq(revisions.id, input.revisionId),
      inArray(revisions.status, [...RUNNING_REVISION_STATUSES]),
    ))
    .returning()
    .get()

  if (!failedRevision) {
    return loadThreadView(revision.threadId)
  }

  return loadThreadView(revision.threadId)
}

export async function rejectRevision(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision, project } = requireRevision(id)
  if ((RUNNING_REVISION_STATUSES as readonly string[]).includes(revision.status)) {
    throw new Error("Wait for generated changes to finish before deleting them.")
  }

  let cleanupError: string | null = null

  if (revision.contextPath && revision.branch) {
    const sibling = db
      .select({ id: revisions.id })
      .from(revisions)
      .where(and(
        eq(revisions.threadId, revision.threadId),
        eq(revisions.contextPath, revision.contextPath),
        inArray(revisions.status, [
          "queued",
          "preparing",
          "running",
          "updating",
          "proposed",
          "answered",
        ]),
      ))
      .all()
      .find((item) => item.id !== revision.id)

    if (!sibling) {
      const cleanup = await removeWorktree(
        resolveRevisionProjectPath(project),
        revision.contextPath,
      )
      cleanupError = cleanup.success ? null : cleanup.error ?? "Cleanup failed."
    }
  }

  db.update(revisions)
    .set({
      status: "rejected",
      errorMessage: cleanupError,
      updatedAt: dateNow(),
      resolvedAt: dateNow(),
    })
    .where(eq(revisions.id, id))
    .run()

  return loadThreadView(revision.threadId)
}

export async function acceptRevision(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision, project } = requireRevision(id)
  if (!revision.contextPath) {
    const recoveredRevision = await prepareMissingRevisionWorkspaceForRecovery({
      db,
      revision,
      project,
    })
    return loadThreadView(recoveredRevision.threadId)
  }
  if (revision.status !== "proposed") {
    throw new Error("Changes are not ready to accept yet.")
  }

  const projectPath = resolveRevisionProjectPath(project)
  const revisionPath = resolve(revision.contextPath)
  const acceptance = await acceptIsolatedWorkspace({
    strategy: "patch",
    projectPath,
    workspacePath: revisionPath,
    baseProjectCommit: revision.baseProjectCommit,
    commitMessage: "Accept Ripple comment changes",
  })

  const summary = diffSummaryFromPatch(acceptance.proposalPatch ?? "")
  const now = dateNow()
  db.transaction(() => {
    db.update(revisions)
      .set({
        status: "accepted",
        diffSummary: serializeDiffSummary(summary),
        updatedAt: now,
        resolvedAt: now,
      })
      .where(eq(revisions.id, id))
      .run()
    db.update(commentThreads)
      .set({
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(commentThreads.id, revision.threadId))
      .run()
    updateCommentConversationStatus({
      db,
      threadId: revision.threadId,
      status: "resolved",
      deletedAt: null,
    })
    if (acceptance.acceptedProjectCommit) {
      markStaleProjectRevisionsUpdating({
        db,
        projectId: revision.projectId,
        currentCommit: acceptance.acceptedProjectCommit,
        acceptedRevisionId: revision.id,
      })
    }
  })

  return loadThreadView(revision.threadId)
}

export function buildCommentAnchorFromSeconds(input: {
  startTime: number
  endTime?: number | null
  startFrame?: number | null
  endFrame?: number | null
  elementSelector?: string | null
  clipKey?: string | null
  sourceFile?: string | null
}): RippleCommentAnchorInput {
  return {
    anchorType:
      input.elementSelector || input.clipKey
        ? "element"
        : input.endTime && input.endTime > input.startTime
          ? "range"
          : "frame",
    startTime: msToSeconds(Math.round(input.startTime * 1000)),
    endTime: input.endTime ?? null,
    startFrame: input.startFrame ?? null,
    endFrame: input.endFrame ?? null,
    elementSelector: input.elementSelector ?? null,
    clipKey: input.clipKey ?? null,
    sourceFile: input.sourceFile ?? null,
  }
}
