import { normalizeRipplePreviewTime } from "./ripple-preview-time"

export type RipplePreviewTarget =
  | { kind: "main" }
  | { kind: "comment-revision"; revisionId: string; seekTime: number }
  | { kind: "chat-worktree"; chatId: string }

export interface RipplePreviewTransition {
  target: RipplePreviewTarget
  seekTime: number
}

export function getActiveRipplePreviewRevisionId(
  target: RipplePreviewTarget,
): string | null {
  return target.kind === "comment-revision" ? target.revisionId : null
}

export function getActiveRipplePreviewChatId(
  target: RipplePreviewTarget,
): string | null {
  return target.kind === "chat-worktree" ? target.chatId : null
}

export function resetRipplePreviewTarget(): RipplePreviewTransition {
  return {
    target: { kind: "main" },
    seekTime: 0,
  }
}

export function selectRippleMainPreview(input: {
  currentTime: number
  requestedTime?: number | null
}): RipplePreviewTransition {
  const seekTime = normalizeRipplePreviewTime(
    typeof input.requestedTime === "number"
      ? input.requestedTime
      : input.currentTime,
  )
  return {
    target: { kind: "main" },
    seekTime,
  }
}

export function selectRippleCommentPreview(input: {
  threadId: string
  time: number
  revisionId?: string | null
}): RipplePreviewTransition & { selectedThreadId: string } {
  const seekTime = normalizeRipplePreviewTime(input.time)
  return {
    selectedThreadId: input.threadId,
    target: input.revisionId
      ? { kind: "comment-revision", revisionId: input.revisionId, seekTime }
      : { kind: "main" },
    seekTime,
  }
}

export function selectRippleRevisionPreview(input: {
  revisionId: string
  time: number
}): RipplePreviewTransition {
  const seekTime = normalizeRipplePreviewTime(input.time)
  return {
    target: { kind: "comment-revision", revisionId: input.revisionId, seekTime },
    seekTime,
  }
}

export function selectRippleRevisionChatPreview(input: {
  revisionId?: string | null
  time?: number | null
}): RipplePreviewTransition {
  const seekTime = normalizeRipplePreviewTime(input.time)
  return {
    target: input.revisionId
      ? { kind: "comment-revision", revisionId: input.revisionId, seekTime }
      : { kind: "main" },
    seekTime,
  }
}

export function selectRippleChatDraftPreview(input: {
  chatId: string
  currentTime: number
}): RipplePreviewTransition {
  return {
    target: { kind: "chat-worktree", chatId: input.chatId },
    seekTime: normalizeRipplePreviewTime(input.currentTime),
  }
}

export function selectRippleProjectChatPreview(input: {
  currentTime: number
}): RipplePreviewTransition {
  return selectRippleMainPreview({ currentTime: input.currentTime })
}
