import {
  getDatabase,
  transcriptMessages,
  type AgentRun,
  type AgentRunEvent,
  type AgentThread,
} from "../db"
import { appendConversationMessage } from "../conversations/service"

type Db = ReturnType<typeof getDatabase>

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
      conversationId: input.run.conversationId,
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

export function recordRunUserPromptProjection(input: {
  db?: Db
  thread: AgentThread
  run: AgentRun
}): void {
  const metadata = {
    source: input.run.runKind,
    provider: input.run.provider,
    model: input.run.model,
    agentRunId: input.run.id,
    agentThreadId: input.thread.id,
  }
  appendTranscriptMessage({
    db: input.db,
    thread: input.thread,
    run: input.run,
    role: "user",
    body: input.run.prompt,
    metadata,
  })
  if (input.run.runKind !== "generated_change" || !input.run.threadId) {
    appendConversationMessage({
      db: input.db,
      conversationId: input.run.conversationId,
      role: "user",
      body: input.run.prompt,
      agentRunId: input.run.id,
      metadata,
    })
  }
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
  appendConversationMessage({
    db: input.db,
    conversationId: input.run.conversationId,
    role: "assistant",
    body: input.summary,
    parts: input.parts,
    metadata,
    agentRunId: input.run.id,
    sourceEventId: input.sourceEvent?.id ?? null,
  })
}
