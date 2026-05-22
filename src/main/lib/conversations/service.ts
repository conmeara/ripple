import { and, asc, desc, eq } from "drizzle-orm"
import {
  titleFromConversationBody,
  type RippleConversationDetailView,
  type RippleConversationMessageRole,
  type RippleConversationMessageView,
  type RippleConversationView,
} from "../../../shared/ripple-conversations"
import {
  commentThreads,
  conversationMessages,
  conversations,
  getDatabase,
  type CommentThread,
  type Conversation,
  type ConversationMessage,
} from "../db"
import { createId } from "../db/utils"

type Db = ReturnType<typeof getDatabase>

export type ConversationKind =
  | "project"
  | "comment"
  | "revision"
  | "export"
  | "support"

export interface CreateConversationInput {
  id?: string
  projectId: string
  compositionId?: string | null
  commentThreadId?: string | null
  revisionId?: string | null
  kind: ConversationKind
  title?: string | null
  summary?: string | null
  mode?: "plan" | "agent"
  sessionId?: string | null
  streamId?: string | null
  worktreePath?: string | null
  branch?: string | null
  baseBranch?: string | null
  prUrl?: string | null
  prNumber?: number | null
}

function parseJsonObject(value: string | null | undefined): Record<string, any> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function parseJsonArray(value: string | null | undefined): Array<Record<string, any>> {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function messageBodyFromParts(parts: Record<string, unknown>[]): string {
  return parts
    .map((part: any) =>
      part?.type === "text" && typeof part.text === "string" ? part.text : null,
    )
    .filter((part: string | null): part is string => Boolean(part))
    .join("\n")
    .trim()
}

function recoverAgentReplyParts(message: ConversationMessage): Array<Record<string, any>> {
  const parts = parseJsonArray(message.partsJson)
  if (message.role !== "assistant" || !message.agentRunId) return parts

  const body = message.body.trim()
  if (!body) return parts

  const visibleText = messageBodyFromParts(parts)
  if (visibleText.includes(body)) return parts

  return [
    ...parts,
    {
      type: "text",
      text: body,
      state: "done",
      id: `recovered-${message.id}`,
    },
  ]
}

function toConversationMessageView(
  message: ConversationMessage,
): RippleConversationMessageView {
  return {
    id: message.id,
    conversationId: message.conversationId,
    agentRunId: message.agentRunId,
    sourceEventId: message.sourceEventId,
    role: message.role as RippleConversationMessageRole,
    body: message.body,
    partsJson: message.partsJson,
    metadataJson: message.metadataJson,
    createdAt: message.createdAt,
  }
}

function toConversationView(
  conversation: Conversation,
  messages: ConversationMessage[],
): RippleConversationView {
  const latest = messages[messages.length - 1] ?? null
  return {
    id: conversation.id,
    projectId: conversation.projectId,
    compositionId: conversation.compositionId,
    commentThreadId: conversation.commentThreadId,
    revisionId: conversation.revisionId,
    kind: conversation.kind,
    title: conversation.title,
    summary: conversation.summary,
    status: conversation.status,
    mode: conversation.mode,
    sessionId: conversation.sessionId,
    streamId: conversation.streamId,
    worktreePath: conversation.worktreePath,
    branch: conversation.branch,
    baseBranch: conversation.baseBranch,
    prUrl: conversation.prUrl,
    prNumber: conversation.prNumber,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt,
    deletedAt: conversation.deletedAt,
    messageCount: messages.length,
    latestMessageBody: latest?.body ?? null,
    latestMessageRole: latest ? (latest.role as RippleConversationMessageRole) : null,
    latestMessageAt: latest?.createdAt ?? null,
  }
}

export function createConversation(
  input: CreateConversationInput,
  db: Db = getDatabase(),
): Conversation {
  const now = new Date()
  return db
    .insert(conversations)
    .values({
      id: input.id ?? createId(),
      projectId: input.projectId,
      compositionId: input.compositionId ?? null,
      commentThreadId: input.commentThreadId ?? null,
      revisionId: input.revisionId ?? null,
      kind: input.kind,
      title: input.title ?? null,
      summary: input.summary ?? null,
      status: "open",
      mode: input.mode ?? "agent",
      sessionId: input.sessionId ?? null,
      streamId: input.streamId ?? null,
      worktreePath: input.worktreePath ?? null,
      branch: input.branch ?? null,
      baseBranch: input.baseBranch ?? null,
      prUrl: input.prUrl ?? null,
      prNumber: input.prNumber ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
}

export function createProjectConversation(input: {
  projectId: string
  compositionId?: string | null
  title?: string | null
  initialBody?: string | null
  db?: Db
}): Conversation {
  return createConversation(
    {
      projectId: input.projectId,
      compositionId: input.compositionId ?? null,
      kind: "project",
      title: input.title ?? titleFromConversationBody(input.initialBody ?? ""),
    },
    input.db ?? getDatabase(),
  )
}

export function getConversationView(
  id: string,
  db: Db = getDatabase(),
): RippleConversationDetailView | null {
  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .get()
  if (!conversation || conversation.deletedAt) return null

  const messages = db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, id))
    .orderBy(asc(conversationMessages.createdAt))
    .all()

  return {
    ...toConversationView(conversation, messages),
    messages: messages.map(toConversationMessageView),
  }
}

export function listProjectConversations(input: {
  projectId: string
  includeDeleted?: boolean
  db?: Db
}): RippleConversationView[] {
  const db = input.db ?? getDatabase()
  const rows = db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.projectId, input.projectId),
      eq(conversations.kind, "project"),
    ))
    .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt))
    .all()
    .filter((conversation) => input.includeDeleted || !conversation.deletedAt)

  return rows.map((conversation) => {
    const messages = db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversation.id))
      .orderBy(asc(conversationMessages.createdAt))
      .all()
    return toConversationView(conversation, messages)
  })
}

export function ensureCommentConversation(input: {
  thread: CommentThread
  title?: string | null
  db?: Db
}): Conversation {
  const db = input.db ?? getDatabase()
  if (input.thread.conversationId) {
    const existing = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, input.thread.conversationId))
      .get()
    if (existing) return existing
  }

  const conversation = createConversation(
    {
      projectId: input.thread.projectId,
      compositionId: input.thread.compositionId,
      commentThreadId: input.thread.id,
      kind: "comment",
      title: input.title ?? null,
    },
    db,
  )

  db.update(commentThreads)
    .set({
      conversationId: conversation.id,
      updatedAt: new Date(),
    })
    .where(eq(commentThreads.id, input.thread.id))
    .run()

  return conversation
}

export function appendConversationMessage(input: {
  db?: Db
  id?: string
  conversationId?: string | null
  role: "user" | "assistant" | "system" | "tool"
  body: string
  parts?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
  agentRunId?: string | null
  sourceEventId?: string | null
}): void {
  if (!input.conversationId) return
  const db = input.db ?? getDatabase()
  const now = new Date()
  const metadata = input.metadata ?? {}
  if (input.role === "user" && typeof metadata.agentRunId === "string") {
    const latest = db
      .select({
        role: conversationMessages.role,
        body: conversationMessages.body,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, input.conversationId))
      .orderBy(desc(conversationMessages.createdAt))
      .get()
    if (latest?.role === "user" && latest.body.trim() === input.body.trim()) {
      db.update(conversations)
        .set({
          status: "open",
          archivedAt: null,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(conversations.id, input.conversationId))
        .run()
      return
    }
  }

  db.insert(conversationMessages)
    .values({
      id: input.id ?? createId(),
      conversationId: input.conversationId,
      agentRunId: input.agentRunId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      role: input.role,
      body: input.body,
      partsJson: JSON.stringify(input.parts ?? [{ type: "text", text: input.body }]),
      metadataJson: JSON.stringify(metadata),
      createdAt: now,
    })
    .run()

  const conversationUpdate =
    input.role === "user"
      ? {
          status: "open" as const,
          archivedAt: null,
          deletedAt: null,
          updatedAt: now,
        }
      : { updatedAt: now }
  db.update(conversations)
    .set(conversationUpdate)
    .where(eq(conversations.id, input.conversationId))
    .run()
}

export function conversationMessagesToUiMessages(
  messages: ConversationMessage[],
): Array<Record<string, any>> {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: recoverAgentReplyParts(message),
    metadata: parseJsonObject(message.metadataJson),
  }))
}

export function getConversationUiMessages(
  conversationId: string,
  db: Db = getDatabase(),
): Array<Record<string, any>> {
  const messages = db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt))
    .all()
  return conversationMessagesToUiMessages(messages)
}

export function getConversationMessagesJson(
  conversationId: string,
  db: Db = getDatabase(),
): string {
  return JSON.stringify(getConversationUiMessages(conversationId, db))
}

export function replaceConversationMessages(input: {
  db?: Db
  conversationId: string
  messages: Array<Record<string, any>>
}): void {
  const db = input.db ?? getDatabase()
  const now = new Date()
  db.transaction(() => {
    db.delete(conversationMessages)
      .where(eq(conversationMessages.conversationId, input.conversationId))
      .run()

    input.messages.forEach((message, index) => {
      const parts = Array.isArray(message.parts) ? message.parts : []
      const body = messageBodyFromParts(parts)
      db.insert(conversationMessages)
        .values({
          id: typeof message.id === "string" && message.id ? message.id : createId(),
          conversationId: input.conversationId,
          role: message.role === "assistant" ||
            message.role === "system" ||
            message.role === "tool"
            ? message.role
            : "user",
          body,
          partsJson: JSON.stringify(parts),
          metadataJson: JSON.stringify(
            message.metadata && typeof message.metadata === "object"
              ? message.metadata
              : {},
          ),
          createdAt: new Date(now.getTime() + index),
        })
        .run()
    })

    db.update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, input.conversationId))
      .run()
  })
}

export function appendConversationUiMessage(input: {
  db?: Db
  conversationId: string
  message: Record<string, any>
}): void {
  const parts = Array.isArray(input.message.parts) ? input.message.parts : []
  appendConversationMessage({
    db: input.db,
    id: typeof input.message.id === "string" && input.message.id
      ? input.message.id
      : undefined,
    conversationId: input.conversationId,
    role: input.message.role === "assistant" ||
      input.message.role === "system" ||
      input.message.role === "tool"
      ? input.message.role
      : "user",
    body: messageBodyFromParts(parts),
    parts,
    metadata: input.message.metadata && typeof input.message.metadata === "object"
      ? input.message.metadata
      : {},
  })
}
