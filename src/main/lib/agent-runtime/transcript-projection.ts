import { eq } from "drizzle-orm"
import {
  getDatabase,
  subChats,
  transcriptMessages,
  type AgentRun,
  type AgentRunEvent,
  type AgentThread,
} from "../db"
import { createId } from "../db/utils"

type Db = ReturnType<typeof getDatabase>

function parseMessages(value: string | null | undefined): any[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function makeMessage(input: {
  id?: string
  role: "user" | "assistant" | "system"
  text: string
  parts?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    id: input.id ?? createId(),
    role: input.role,
    parts: input.parts ?? [{ type: "text", text: input.text }],
    metadata: input.metadata ?? {},
  }
}

function extractMessageText(message: any): string {
  const parts = Array.isArray(message?.parts) ? message.parts : []
  return parts
    .map((part: any) =>
      part?.type === "text" && typeof part.text === "string" ? part.text : null,
    )
    .filter((part: string | null): part is string => Boolean(part))
    .join("\n")
    .trim()
}

export function appendTranscriptMessage(input: {
  db?: Db
  thread: AgentThread
  run: AgentRun
  role: "user" | "assistant" | "system"
  body: string
  sourceEvent?: AgentRunEvent | null
  metadata?: Record<string, unknown>
}): void {
  const db = input.db ?? getDatabase()
  db.insert(transcriptMessages)
    .values({
      agentThreadId: input.thread.id,
      agentRunId: input.run.id,
      chatId: input.run.chatId,
      subChatId: input.run.subChatId,
      role: input.role,
      body: input.body,
      sourceEventId: input.sourceEvent?.id ?? null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: new Date(),
    })
    .run()
}

export function appendSubChatMessageProjection(input: {
  db?: Db
  subChatId: string | null
  role: "user" | "assistant" | "system"
  body: string
  parts?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}): void {
  if (!input.subChatId) return
  const db = input.db ?? getDatabase()
  const subChat = db
    .select({ messages: subChats.messages })
    .from(subChats)
    .where(eq(subChats.id, input.subChatId))
    .get()
  if (!subChat) return

  const messages = parseMessages(subChat.messages)
  if (input.role === "user") {
    const last = messages[messages.length - 1]
    if (last?.role === "user" && extractMessageText(last) === input.body.trim()) {
      return
    }
  }

  messages.push(makeMessage({
    role: input.role,
    text: input.body,
    parts: input.parts,
    metadata: input.metadata,
  }))

  db.update(subChats)
    .set({
      messages: JSON.stringify(messages),
      updatedAt: new Date(),
    })
    .where(eq(subChats.id, input.subChatId))
    .run()
}

export function recordRunUserPromptProjection(input: {
  db?: Db
  thread: AgentThread
  run: AgentRun
}): void {
  appendTranscriptMessage({
    db: input.db,
    thread: input.thread,
    run: input.run,
    role: "user",
    body: input.run.prompt,
    metadata: {
      source: input.run.runKind,
      provider: input.run.provider,
      model: input.run.model,
    },
  })
  appendSubChatMessageProjection({
    db: input.db,
    subChatId: input.run.subChatId,
    role: "user",
    body: input.run.prompt,
    metadata: {
      source: input.run.runKind,
      provider: input.run.provider,
      model: input.run.model,
      agentRunId: input.run.id,
      agentThreadId: input.thread.id,
    },
  })
}

export function recordRunAssistantProjection(input: {
  db?: Db
  thread: AgentThread
  run: AgentRun
  sourceEvent?: AgentRunEvent | null
  summary: string
  parts?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}): void {
  const metadata = {
    source: "agent-runtime",
    provider: input.run.provider,
    model: input.run.model,
    agentRunId: input.run.id,
    agentThreadId: input.thread.id,
    sessionId: input.run.providerSessionId ?? undefined,
    ...(input.metadata ?? {}),
  }
  appendTranscriptMessage({
    db: input.db,
    thread: input.thread,
    run: input.run,
    role: "assistant",
    body: input.summary,
    sourceEvent: input.sourceEvent,
    metadata,
  })
  appendSubChatMessageProjection({
    db: input.db,
    subChatId: input.run.subChatId,
    role: "assistant",
    body: input.summary,
    parts: input.parts,
    metadata,
  })
}
