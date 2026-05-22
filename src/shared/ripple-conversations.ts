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

const MAX_CONVERSATION_TITLE_LENGTH = 48

export interface RippleConversationTitleContext {
  projectName?: string | null
  compositionName?: string | null
  previewLabel?: string | null
}

function compactConversationText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function stripPoliteTitlePrefix(value: string): string {
  const stripped = value
    .replace(/^(?:please\s+)?(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^please\s+/i, "")
    .trim()

  return stripped === value ? stripped : capitalizeLeadingAscii(stripped)
}

function removeLowSignalDetailSuffix(value: string): string {
  return value
    .replace(/\s+on\s+beat\s+\d+\b.*$/i, "")
    .trim()
}

function capitalizeLeadingAscii(value: string): string {
  return value.replace(/^[a-z]/, (letter) => letter.toUpperCase())
}

function truncateConversationTitle(value: string): string {
  if (value.length <= MAX_CONVERSATION_TITLE_LENGTH) return value

  const head = value
    .slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)
    .trimEnd()
  const wordBoundary = head.lastIndexOf(" ")
  const title = wordBoundary >= 24 ? head.slice(0, wordBoundary) : head

  return `${title.trimEnd()}...`
}

function titleCaseLeadingWord(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`
}

function titleForVagueRequest(
  value: string,
  context?: RippleConversationTitleContext | null,
): string | null {
  const match = value.match(
    /^(fix|update|change|adjust|improve|polish|animate|export|review|make)(?:\s+(?:this|that|it))?$/i,
  )
  if (!match) return null

  const target = context?.compositionName || context?.previewLabel || context?.projectName
  if (!target) return null

  return `${titleCaseLeadingWord(match[1] ?? "Update")} ${target}`
}

export function normalizeConversationTitleCandidate(
  value: string | null | undefined,
): string | null {
  if (!value) return null

  const cleaned = compactConversationText(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/\s+[.!?。！？]+$/u, "")
    .replace(/[.!?。！？]+$/u, "")
    .trim()

  if (!cleaned) return null
  return truncateConversationTitle(cleaned)
}

export function titleFromConversationBody(
  body: string,
  context?: RippleConversationTitleContext | null,
): string {
  const compact = removeLowSignalDetailSuffix(
    stripPoliteTitlePrefix(compactConversationText(body)),
  )
  const normalized = normalizeConversationTitleCandidate(compact)
  if (!normalized) return "New Chat"
  return titleForVagueRequest(normalized, context) ?? normalized
}
