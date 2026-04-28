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
  chats,
  commentMessages,
  commentThreads,
  compositions,
  getDatabase,
  projects,
  revisions,
  subChats,
  type Composition,
  type CommentThread,
  type Project,
  type Revision,
} from "../db"
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
import {
  appendRippleCommentPromptMessage,
  buildRevisionPrompt,
} from "./comment-prompt"
import {
  buildRevisionProposalPatch,
  refreshRevisionProposalFromLatest,
  resolveRevisionProjectPath,
} from "./revision-acceptance"
import { acceptIsolatedWorkspace } from "./isolated-workspace-acceptance"

type Db = ReturnType<typeof getDatabase>

const RUNNING_REVISION_STATUSES = ["queued", "preparing", "running", "updating"] as const
const REUSABLE_FOLLOW_UP_STATUSES = [
  "queued",
  "preparing",
  "running",
  "updating",
  "proposed",
  "failed",
] as const

export interface CreateCommentThreadInput {
  projectId: string
  compositionId?: string | null
  body: string
  anchor: RippleCommentAnchorInput
  createRevision?: boolean
  model?: string
  clientRequestId?: string | null
}

export interface AddCommentReplyInput {
  threadId: string
  body: string
  createRevision?: boolean
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

function normalizeClientRequestId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.length > 128) {
    throw new Error("Comment request id is too long.")
  }
  return trimmed
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

function fallbackRevisionSummary(summary: RippleRevisionDiffSummary): string {
  if (summary.fileCount === 0) {
    return "Agent finished without project changes."
  }
  const fileLabel = summary.fileCount === 1 ? "file" : "files"
  if (summary.additions || summary.deletions) {
    return `Updated ${summary.fileCount} ${fileLabel}, +${summary.additions}/-${summary.deletions}.`
  }
  return `Updated ${summary.fileCount} ${fileLabel}.`
}

function getRevisionDiffSummaryForView(
  db: ReturnType<typeof getDatabase>,
  revision: Revision,
): string | null {
  const summary = parseStoredDiffSummary(revision.diffSummary)
  if (!summary || !revision.subChatId) return revision.diffSummary

  const subChat = db
    .select({ messages: subChats.messages })
    .from(subChats)
    .where(eq(subChats.id, revision.subChatId))
    .get()
  const assistantSummary = extractAssistantFinalResponseFromMessages(subChat?.messages)
  if (!assistantSummary) return revision.diffSummary
  return serializeDiffSummary({ ...summary, summary: assistantSummary })
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

export async function createCommentThread(
  input: CreateCommentThreadInput,
): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const project = getProject(db, input.projectId)
  assertComposition(db, input.projectId, input.compositionId)

  const body = assertBody(input.body)
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
  const messageId = createId()
  const thread = db.transaction(() => {
    const createdThread = db
      .insert(commentThreads)
      .values({
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
        clientRequestId,
        createdAt: now,
      })
      .run()

    return createdThread
  })

  if (input.createRevision ?? true) {
    await createRevisionForThread({
      threadId: thread.id,
      body,
      project,
      messageId,
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
  const project = getProject(db, thread.projectId)
  const body = assertBody(input.body)
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
        clientRequestId,
        createdAt: now,
      })
      .run()
    db.update(commentThreads)
      .set({ status: "open", updatedAt: now, resolvedAt: null })
      .where(eq(commentThreads.id, thread.id))
      .run()
  })

  if (input.createRevision ?? true) {
    await createRevisionForThread({
      threadId: thread.id,
      body,
      project,
      baseRevisionId: thread.latestRevisionId,
      messageId,
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
  model?: string
}): Promise<Revision> {
  const db = getDatabase()
  const thread = db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, input.threadId))
    .get()
  if (!thread) throw new Error("Comment thread not found.")
  const project = input.project ?? getProject(db, thread.projectId)
  const composition = getCompositionForPrompt(db, thread.compositionId)
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
    baseRevision.chatId &&
    baseRevision.subChatId &&
    (REUSABLE_FOLLOW_UP_STATUSES as readonly string[]).includes(baseRevision.status)
      ? baseRevision
      : null

  if (reusableBaseRevision) {
    await stat(reusableBaseRevision.contextPath!)

    const subChat = db
      .select({ messages: subChats.messages })
      .from(subChats)
      .where(eq(subChats.id, reusableBaseRevision.subChatId!))
      .get()
    if (!subChat) {
      throw new Error("The revision chat is not available.")
    }

    const revision = db.transaction(() => {
      const createdRevision = db
        .insert(revisions)
        .values({
          id: revisionId,
          threadId: thread.id,
          projectId: project.id,
          compositionId: thread.compositionId,
          chatId: reusableBaseRevision.chatId,
          subChatId: reusableBaseRevision.subChatId,
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

      db.update(subChats)
        .set({
          messages: appendRippleCommentPromptMessage({
            messages: subChat.messages,
            prompt,
            threadId: thread.id,
            revisionId: createdRevision.id,
            model: input.model,
          }),
          updatedAt: now,
        })
        .where(eq(subChats.id, reusableBaseRevision.subChatId!))
        .run()
      db.update(chats)
        .set({ updatedAt: now })
        .where(eq(chats.id, reusableBaseRevision.chatId!))
        .run()
      if (
        reusableBaseRevision.status === "proposed" ||
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

  const chatId = createId()
  const subChatId = createId()
  const chatName = `Comment ${timecodeFromMs(thread.startTime)}`
  const initialMessages = appendRippleCommentPromptMessage({
    messages: [],
    prompt,
    threadId: thread.id,
    revisionId,
    model: input.model,
  })

  let revision = db.transaction(() => {
    db.insert(chats)
      .values({
        id: chatId,
        name: chatName,
        projectId: project.id,
        isHidden: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    db.insert(subChats)
      .values({
        id: subChatId,
        chatId,
        name: "Comment changes",
        mode: "agent",
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const createdRevision = db
      .insert(revisions)
      .values({
        id: revisionId,
        threadId: thread.id,
        projectId: project.id,
        compositionId: thread.compositionId,
        chatId,
        subChatId,
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

    return createdRevision
  })

  try {
    const projectPath = resolveRevisionProjectPath(project)
    const base = await ensureRippleProjectGitRepository(projectPath)
    const branchType = await hasOriginRemote(base.projectPath) ? undefined : "local"
    const result = await createWorktreeForChat(
      base.projectPath,
      sanitizeProjectName(project.name),
      chatId,
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
      db.update(chats)
        .set({
          worktreePath: contextPath,
          branch: result.branch ?? null,
          baseBranch: result.baseBranch ?? null,
          updatedAt: dateNow(),
        })
        .where(eq(chats.id, chatId))
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

export async function deleteCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const now = dateNow()
  const threadRevisions = db
    .select()
    .from(revisions)
    .where(eq(revisions.threadId, threadId))
    .all()
  const activeRevision = threadRevisions.find((revision) =>
    (RUNNING_REVISION_STATUSES as readonly string[]).includes(revision.status),
  )
  if (activeRevision) {
    throw new Error("Wait for generated changes to finish before deleting this comment.")
  }

  const projectsById = new Map<string, Project>()
  const cleanedContexts = new Set<string>()

  for (const revision of threadRevisions) {
    if (revision.status === "accepted") continue

    let cleanupError: string | null = null
    if (revision.contextPath && revision.branch) {
      const contextKey = resolve(revision.contextPath)
      if (!cleanedContexts.has(contextKey)) {
        cleanedContexts.add(contextKey)
        let project = projectsById.get(revision.projectId)
        if (!project) {
          project = db
            .select()
            .from(projects)
            .where(eq(projects.id, revision.projectId))
            .get()
          if (project) projectsById.set(revision.projectId, project)
        }

        if (project) {
          const cleanup = await removeWorktree(
            resolveRevisionProjectPath(project),
            revision.contextPath,
          )
          cleanupError = cleanup.success ? null : cleanup.error ?? "Cleanup failed."
        }
      }
    }

    db.update(revisions)
      .set({
        status: "rejected",
        errorMessage: cleanupError,
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
  return loadThreadView(threadId)
}

export async function restoreCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  db.update(commentThreads)
    .set({ deletedAt: null, updatedAt: dateNow() })
    .where(eq(commentThreads.id, threadId))
    .run()
  return loadThreadView(threadId)
}

export async function resolveCommentThread(threadId: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const now = dateNow()
  db.update(commentThreads)
    .set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(eq(commentThreads.id, threadId))
    .run()
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
  const nextStatus = summary.fileCount > 0 ? "proposed" : revision.status
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

function markStaleProjectRevisionsUpdating(input: {
  db: Db
  projectId: string
  currentCommit: string
  acceptedRevisionId: string
}): void {
  const now = dateNow()
  const staleRevisions = input.db
    .select()
    .from(revisions)
    .where(and(
      eq(revisions.projectId, input.projectId),
      eq(revisions.status, "proposed"),
    ))
    .all()
    .filter((revision) =>
      revision.id !== input.acceptedRevisionId &&
      Boolean(revision.baseProjectCommit) &&
      revision.baseProjectCommit !== input.currentCommit,
    )

  for (const revision of staleRevisions) {
    input.db.update(revisions)
      .set({
        status: "updating",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(revisions.id, revision.id))
      .run()
  }
}

export async function updateStaleRevisionProposal(id: string): Promise<RippleCommentThreadView> {
  const db = getDatabase()
  const { revision, project } = requireRevision(id)
  if (revision.status !== "updating") {
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
      db.update(revisions)
        .set({
          status: "proposed",
          baseProjectCommit: refresh.currentCommit,
          diffSummary: serializeDiffSummary(summary),
          errorMessage: null,
          updatedAt: dateNow(),
        })
        .where(eq(revisions.id, id))
        .run()
      return loadThreadView(revision.threadId)
    }

    if (!revision.subChatId) {
      throw new Error("The revision chat is not available.")
    }
    const subChat = db
      .select({ messages: subChats.messages })
      .from(subChats)
      .where(eq(subChats.id, revision.subChatId))
      .get()
    if (!subChat) {
      throw new Error("The revision chat is not available.")
    }

    const now = dateNow()
    db.update(subChats)
      .set({
        messages: appendRippleCommentPromptMessage({
          messages: subChat.messages,
          prompt: "Pull and Resolve from Main",
          threadId: revision.threadId,
          revisionId: revision.id,
        }),
        updatedAt: now,
      })
      .where(eq(subChats.id, revision.subChatId))
      .run()
    if (revision.chatId) {
      db.update(chats)
        .set({ updatedAt: now })
        .where(eq(chats.id, revision.chatId))
        .run()
    }
    db.update(revisions)
      .set({
        status: "queued",
        baseProjectCommit: refresh.currentCommit,
        diffSummary: serializeDiffSummary(summary),
        errorMessage: null,
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
    .where(and(eq(revisions.id, id), eq(revisions.status, "queued")))
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
  const subChat = revision.subChatId
    ? db
        .select({ messages: subChats.messages })
        .from(subChats)
        .where(eq(subChats.id, revision.subChatId))
        .get()
    : null
  summary.summary =
    extractAssistantFinalResponseFromMessages(subChat?.messages) ||
    fallbackRevisionSummary(summary)

  const completedRevision = db.update(revisions)
    .set({
      status: "proposed",
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
        inArray(revisions.status, ["queued", "preparing", "running", "updating", "proposed"]),
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
    throw new Error("The temporary workspace is not available.")
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
