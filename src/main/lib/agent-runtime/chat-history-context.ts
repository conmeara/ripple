import { asc, eq } from "drizzle-orm"
import {
  conversationMessages,
  type AgentRun,
  type AgentThread,
  type ConversationMessage,
} from "../db/schema"

type Db = any

const MAX_HISTORY_CHARS = 24_000
const MAX_HISTORY_MESSAGES = 24
const MAX_MESSAGE_CHARS = 4_000

function roleLabel(role: string): string {
  if (role === "user") return "User"
  if (role === "assistant") return "Assistant"
  if (role === "system") return "System"
  return role
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const head = Math.floor(maxChars * 0.6)
  const tail = Math.max(0, maxChars - head - 34)
  return `${value.slice(0, head).trimEnd()}\n[...middle omitted...]\n${value.slice(value.length - tail).trimStart()}`
}

function messageBody(message: Pick<ConversationMessage, "body" | "partsJson">): string {
  const body = message.body.trim()
  if (body) return body

  try {
    const parts = JSON.parse(message.partsJson || "[]")
    if (!Array.isArray(parts)) return ""
    return parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
      .trim()
  } catch {
    return ""
  }
}

export function shouldIncludeConversationHistory(input: {
  run: Pick<AgentRun, "provider" | "runKind" | "conversationId">
  thread: Pick<AgentThread, "providerSessionId">
}): boolean {
  if (
    input.run.runKind !== "chat" &&
    input.run.runKind !== "generated_change"
  ) return false
  if (!input.run.conversationId) return false
  if (input.run.provider === "codex") return true
  if (input.run.provider === "claude") return !input.thread.providerSessionId
  return true
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
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

export function filterConversationHistoryMessagesForRun(input: {
  messages: Array<Pick<ConversationMessage, "agentRunId" | "metadataJson">>
  run: Pick<AgentRun, "id" | "runKind" | "revisionId">
}): Array<Pick<ConversationMessage, "agentRunId" | "metadataJson">> {
  return input.messages.filter((message) => {
    if (message.agentRunId === input.run.id) return false
    if (input.run.runKind !== "generated_change" || !input.run.revisionId) {
      return true
    }

    const metadata = parseMetadata(message.metadataJson)
    return metadata.revisionId !== input.run.revisionId
  })
}

export function formatConversationHistoryForPrompt(
  messages: Array<Pick<ConversationMessage, "role" | "body" | "partsJson">>,
): string | null {
  const formatted = messages
    .map((message) => {
      const body = truncateMiddle(messageBody(message), MAX_MESSAGE_CHARS)
      return body ? `${roleLabel(message.role)}: ${body}` : null
    })
    .filter((message): message is string => Boolean(message))

  if (formatted.length === 0) return null

  const recent = formatted.slice(-MAX_HISTORY_MESSAGES)
  let content = recent.join("\n\n")
  let truncated = formatted.length > recent.length

  if (content.length > MAX_HISTORY_CHARS) {
    truncated = true
    content = content.slice(content.length - MAX_HISTORY_CHARS)
    const firstBoundary = content.indexOf("\n\n")
    if (firstBoundary >= 0) {
      content = content.slice(firstBoundary + 2)
    }
  }

  return [
    truncated
      ? "Previous conversation context (truncated):"
      : "Previous conversation context:",
    "Use this as the visible chat history. The user's latest request is above.",
    "",
    content,
  ].join("\n")
}

export function buildConversationHistoryContext(input: {
  db: Db
  run: AgentRun
  thread: AgentThread
}): string | null {
  if (!shouldIncludeConversationHistory(input)) return null

  const rows = (input.db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, input.run.conversationId!))
    .orderBy(asc(conversationMessages.createdAt))
    .all() as ConversationMessage[])
  const historyRows = filterConversationHistoryMessagesForRun({
    messages: rows,
    run: input.run,
  }) as ConversationMessage[]

  return formatConversationHistoryForPrompt(historyRows)
}
