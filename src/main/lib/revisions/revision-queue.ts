import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm"
import {
  chats,
  commentThreads,
  getDatabase,
  projects,
  revisions,
  subChats,
  type Project,
  type Revision,
} from "../db"
import { removeWorktree } from "../git/worktree"
import { resolveRevisionProjectPath } from "./revision-acceptance"
import {
  completeRevisionBackgroundRun,
  failRevisionBackgroundRun,
  updateStaleRevisionProposal,
} from "./comment-revisions"

type Db = ReturnType<typeof getDatabase>

const RUNNABLE_REVISION_STATUSES = ["queued"] as const
const RECOVERABLE_STARTUP_STATUSES = ["preparing", "running"] as const
const WORKTREE_REQUIRED_STATUSES = [
  "queued",
  "preparing",
  "running",
  "updating",
  "proposed",
] as const
// Failed revisions keep their workspace so Open in Chat can recover the work.
const CLEANUP_TERMINAL_STATUSES = ["rejected", "superseded"] as const

interface RevisionQueueCandidate {
  revision: Revision
  chat: typeof chats.$inferSelect
  subChat: typeof subChats.$inferSelect
  project: Project
}

export interface RevisionQueueRun {
  revisionId: string
  threadId: string
  chatId: string
  subChatId: string
  projectId: string
  projectPath: string
  worktreePath: string
  mode: "plan" | "agent"
  messages: string | null
  streamId: string | null
}

export interface RevisionRunClaim {
  started: boolean
  job: RevisionQueueRun | null
}

export interface RevisionQueueProcessResult {
  updated: number
  claimed: boolean
  job: RevisionQueueRun | null
}

export interface RevisionQueueRecoveryResult {
  requeued: number
  failed: number
}

export interface RevisionWorktreeCleanupResult {
  checked: number
  cleaned: number
  skipped: number
  failed: number
}

export interface RevisionQueueDiagnostic {
  revisionId: string
  threadId: string
  projectId: string
  projectName: string | null
  status: string
  chatId: string | null
  subChatId: string | null
  streamId: string | null
  contextPath: string | null
  contextExists: boolean | null
  chatWorktreePath: string | null
  branch: string | null
  baseProjectCommit: string | null
  errorMessage: string | null
  updatedAt: Date | null
  createdAt: Date | null
}

function toRevisionQueueRun(candidate: RevisionQueueCandidate): RevisionQueueRun | null {
  if (
    !candidate.revision.chatId ||
    !candidate.revision.subChatId ||
    !candidate.revision.contextPath
  ) {
    return null
  }

  return {
    revisionId: candidate.revision.id,
    threadId: candidate.revision.threadId,
    chatId: candidate.revision.chatId,
    subChatId: candidate.revision.subChatId,
    projectId: candidate.revision.projectId,
    projectPath: resolveRevisionProjectPath(candidate.project),
    worktreePath: candidate.revision.contextPath,
    mode: candidate.subChat.mode === "plan" ? "plan" : "agent",
    messages: candidate.subChat.messages,
    streamId: candidate.subChat.streamId,
  }
}

function listRunnableRevisionCandidates(
  db: Db,
  input: { projectId?: string | null },
): RevisionQueueCandidate[] {
  const conditions = [
    inArray(revisions.status, [...RUNNABLE_REVISION_STATUSES]),
    isNotNull(revisions.chatId),
    isNotNull(revisions.subChatId),
    isNotNull(revisions.contextPath),
  ]
  if (input.projectId) {
    conditions.push(eq(revisions.projectId, input.projectId))
  }

  return db
    .select({
      revision: revisions,
      chat: chats,
      subChat: subChats,
      project: projects,
    })
    .from(revisions)
    .innerJoin(chats, eq(chats.id, revisions.chatId))
    .innerJoin(subChats, eq(subChats.id, revisions.subChatId))
    .innerJoin(projects, eq(projects.id, revisions.projectId))
    .where(and(...conditions))
    .orderBy(asc(revisions.updatedAt), asc(revisions.createdAt))
    .all()
}

function claimRevisionCandidate(
  db: Db,
  candidate: RevisionQueueCandidate,
): RevisionQueueRun | null {
  const claimed = db
    .update(revisions)
    .set({
      status: "running",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(revisions.id, candidate.revision.id),
      eq(revisions.status, "queued"),
    ))
    .returning()
    .get()

  if (!claimed) return null
  return toRevisionQueueRun({
    ...candidate,
    revision: claimed,
  })
}

export async function processQueuedRevisionUpdates(input: {
  projectId?: string | null
} = {}): Promise<number> {
  const db = getDatabase()
  const conditions = [eq(revisions.status, "updating")]
  if (input.projectId) {
    conditions.push(eq(revisions.projectId, input.projectId))
  }

  const staleRevisions = db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(...conditions))
    .orderBy(asc(revisions.updatedAt), asc(revisions.createdAt))
    .all()

  for (const revision of staleRevisions) {
    await updateStaleRevisionProposal(revision.id)
  }

  return staleRevisions.length
}

export async function claimNextRevisionRun(input: {
  projectId?: string | null
} = {}): Promise<RevisionQueueProcessResult> {
  const updated = await processQueuedRevisionUpdates(input)
  const db = getDatabase()
  const candidates = listRunnableRevisionCandidates(db, input)

  for (const candidate of candidates) {
    const job = claimRevisionCandidate(db, candidate)
    if (job) {
      return { updated, claimed: true, job }
    }
  }

  return { updated, claimed: false, job: null }
}

export async function recoverRevisionQueueOnStartup(input: {
  projectId?: string | null
} = {}): Promise<RevisionQueueRecoveryResult> {
  const db = getDatabase()
  const conditions = [
    inArray(revisions.status, [...RECOVERABLE_STARTUP_STATUSES]),
  ]
  if (input.projectId) {
    conditions.push(eq(revisions.projectId, input.projectId))
  }

  const pending = db
    .select()
    .from(revisions)
    .where(and(...conditions))
    .orderBy(asc(revisions.updatedAt), asc(revisions.createdAt))
    .all()
  const now = new Date()
  let requeued = 0
  let failed = 0

  for (const revision of pending) {
    if (!revision.chatId || !revision.subChatId || !revision.contextPath) {
      db.update(revisions)
        .set({
          status: "failed",
          errorMessage:
            "Ripple stopped while preparing this generated change. Add a reply to try again.",
          updatedAt: now,
          resolvedAt: now,
        })
        .where(eq(revisions.id, revision.id))
        .run()
      failed += 1
      continue
    }

    db.update(revisions)
      .set({
        status: "queued",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(revisions.id, revision.id))
      .run()
    requeued += 1
  }

  return { requeued, failed }
}

export async function claimRevisionRun(revisionId: string): Promise<RevisionRunClaim> {
  const db = getDatabase()
  const candidate = db
    .select({
      revision: revisions,
      chat: chats,
      subChat: subChats,
      project: projects,
    })
    .from(revisions)
    .innerJoin(chats, eq(chats.id, revisions.chatId))
    .innerJoin(subChats, eq(subChats.id, revisions.subChatId))
    .innerJoin(projects, eq(projects.id, revisions.projectId))
    .where(and(
      eq(revisions.id, revisionId),
      isNotNull(revisions.chatId),
      isNotNull(revisions.subChatId),
      isNotNull(revisions.contextPath),
    ))
    .get()

  if (!candidate) {
    return { started: false, job: null }
  }

  const job = claimRevisionCandidate(db, candidate)
  return { started: Boolean(job), job }
}

export async function completeRevisionRun(
  revisionId: string,
): Promise<Awaited<ReturnType<typeof completeRevisionBackgroundRun>>> {
  return completeRevisionBackgroundRun(revisionId)
}

export async function failRevisionRun(input: {
  revisionId: string
  errorMessage: string
}): Promise<Awaited<ReturnType<typeof failRevisionBackgroundRun>>> {
  return failRevisionBackgroundRun(input)
}

export async function cleanupTerminalRevisionWorktrees(input: {
  projectId?: string | null
} = {}): Promise<RevisionWorktreeCleanupResult> {
  const db = getDatabase()
  const conditions = [
    inArray(revisions.status, [...CLEANUP_TERMINAL_STATUSES]),
    isNotNull(revisions.contextPath),
    isNotNull(revisions.branch),
  ]
  if (input.projectId) {
    conditions.push(eq(revisions.projectId, input.projectId))
  }

  const candidates = db
    .select({
      revision: revisions,
      project: projects,
    })
    .from(revisions)
    .innerJoin(projects, eq(projects.id, revisions.projectId))
    .where(and(...conditions))
    .orderBy(asc(revisions.updatedAt), asc(revisions.createdAt))
    .all()
  const visitedContexts = new Set<string>()
  const now = new Date()
  let cleaned = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    const contextPath = candidate.revision.contextPath
    if (!contextPath) {
      skipped += 1
      continue
    }
    const contextKey = resolve(contextPath)
    if (visitedContexts.has(contextKey)) {
      skipped += 1
      continue
    }
    visitedContexts.add(contextKey)

    const activeSibling = db
      .select({ id: revisions.id })
      .from(revisions)
      .where(and(
        eq(revisions.contextPath, contextPath),
        inArray(revisions.status, [...WORKTREE_REQUIRED_STATUSES]),
      ))
      .get()
    if (activeSibling) {
      skipped += 1
      continue
    }

    const cleanup = await removeWorktree(
      resolveRevisionProjectPath(candidate.project),
      contextPath,
    )
    if (!cleanup.success) {
      failed += 1
      db.update(revisions)
        .set({
          errorMessage: cleanup.error ?? "Cleanup failed.",
          updatedAt: now,
        })
        .where(eq(revisions.contextPath, contextPath))
        .run()
      continue
    }

    cleaned += 1
    db.update(revisions)
      .set({
        contextPath: null,
        branch: null,
        updatedAt: now,
      })
      .where(and(
        eq(revisions.contextPath, contextPath),
        inArray(revisions.status, [...CLEANUP_TERMINAL_STATUSES]),
      ))
      .run()
  }

  return {
    checked: candidates.length,
    cleaned,
    skipped,
    failed,
  }
}

export function listRevisionQueueDiagnostics(input: {
  projectId?: string | null
} = {}): RevisionQueueDiagnostic[] {
  const db = getDatabase()
  const conditions = []
  if (input.projectId) {
    conditions.push(eq(revisions.projectId, input.projectId))
  }

  const rows = db
    .select({
      revisionId: revisions.id,
      threadId: revisions.threadId,
      projectId: revisions.projectId,
      projectName: projects.name,
      status: revisions.status,
      chatId: revisions.chatId,
      subChatId: revisions.subChatId,
      streamId: subChats.streamId,
      contextPath: revisions.contextPath,
      chatWorktreePath: chats.worktreePath,
      branch: revisions.branch,
      baseProjectCommit: revisions.baseProjectCommit,
      errorMessage: revisions.errorMessage,
      updatedAt: revisions.updatedAt,
      createdAt: revisions.createdAt,
    })
    .from(revisions)
    .innerJoin(projects, eq(projects.id, revisions.projectId))
    .innerJoin(commentThreads, eq(commentThreads.id, revisions.threadId))
    .leftJoin(chats, eq(chats.id, revisions.chatId))
    .leftJoin(subChats, eq(subChats.id, revisions.subChatId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(revisions.updatedAt), desc(revisions.createdAt))
    .all()

  return rows.map((row) => ({
    ...row,
    contextExists: row.contextPath ? existsSync(row.contextPath) : null,
  }))
}
