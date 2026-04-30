export const RIPPLE_CONVERSATION_KINDS = [
  "project",
  "comment",
  "revision",
  "export",
  "support",
] as const

export const RIPPLE_CONVERSATION_STATUSES = [
  "open",
  "resolved",
  "archived",
  "deleted",
] as const

export const RIPPLE_CONVERSATION_MESSAGE_ROLES = [
  "user",
  "assistant",
  "system",
  "tool",
] as const

export type RippleConversationKind = (typeof RIPPLE_CONVERSATION_KINDS)[number]
export type RippleConversationStatus = (typeof RIPPLE_CONVERSATION_STATUSES)[number]
export type RippleConversationMessageRole =
  (typeof RIPPLE_CONVERSATION_MESSAGE_ROLES)[number]

export interface RippleConversationMessageView {
  id: string
  conversationId: string
  agentRunId: string | null
  sourceEventId: string | null
  role: RippleConversationMessageRole
  body: string
  partsJson: string
  metadataJson: string
  createdAt: Date | null
}

export interface RippleConversationView {
  id: string
  projectId: string
  compositionId: string | null
  commentThreadId: string | null
  revisionId: string | null
  kind: RippleConversationKind
  title: string | null
  summary: string | null
  status: RippleConversationStatus
  mode: "plan" | "agent"
  sessionId: string | null
  streamId: string | null
  worktreePath: string | null
  branch: string | null
  baseBranch: string | null
  prUrl: string | null
  prNumber: number | null
  createdAt: Date | null
  updatedAt: Date | null
  archivedAt: Date | null
  deletedAt: Date | null
  messageCount: number
  latestMessageBody: string | null
  latestMessageRole: RippleConversationMessageRole | null
  latestMessageAt: Date | null
}

export interface RippleConversationDetailView extends RippleConversationView {
  messages: RippleConversationMessageView[]
}

export function titleFromConversationBody(body: string): string {
  const compact = body.trim().replace(/\s+/g, " ")
  if (!compact) return "New Chat"
  if (compact.length <= 48) return compact

  const head = compact.slice(0, 45).trimEnd()
  const wordBoundary = head.lastIndexOf(" ")
  const title = wordBoundary >= 24 ? head.slice(0, wordBoundary) : head

  return `${title.trimEnd()}...`
}
