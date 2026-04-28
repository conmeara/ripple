export function isRippleCommentInitialMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") return false
  const metadata = (message as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== "object") return false
  return (metadata as { source?: unknown }).source === "ripple-comment"
}

export function getRippleCommentRevisionId(message: unknown): string | null {
  if (!isRippleCommentInitialMessage(message)) return null
  const metadata = (message as { metadata?: unknown }).metadata
  const revisionId = (metadata as { revisionId?: unknown }).revisionId
  return typeof revisionId === "string" && revisionId.trim()
    ? revisionId
    : null
}

export function shouldAutoGenerateInitialMessage(input: {
  messages: readonly unknown[]
  status: string
  streamId?: string | null
  hasTriggered: boolean
}): boolean {
  if (input.messages.length !== 1) return false
  if (input.status !== "ready") return false
  if (input.streamId) return false
  if (input.hasTriggered) return false
  return true
}
