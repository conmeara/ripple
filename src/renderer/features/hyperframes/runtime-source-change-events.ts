import type {
  HyperframesRuntimePreviewSource,
  HyperframesRuntimeSourceChangeEvent,
  HyperframesSourceWatchSubscriptionInput,
  HyperframesSourceWatchChange,
} from "../../../shared/hyperframes-source-watch"
import {
  HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT,
} from "../../../shared/hyperframes-source-watch"

export type AgentRuntimePreviewContext = {
  projectId?: string | null
  compositionId?: string | null
  previewTimeSeconds?: number | null
  previewFrame?: number | null
  previewSource?: HyperframesRuntimePreviewSource | null
  commentThreadId?: string | null
  revisionId?: string | null
  exportJobId?: string | null
}

export type RuntimeSourceEvent = {
  id?: string
  type?: string
  providerId?: string | null
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

export function runtimeSourceChangeMatchesPreview(
  event: HyperframesRuntimeSourceChangeEvent,
  input: HyperframesSourceWatchSubscriptionInput,
): boolean {
  if (!event.projectId || event.projectId !== input.projectId) return false

  const previewSource = event.previewSource
  if (input.revisionId) {
    return (
      event.revisionId === input.revisionId ||
      (
        previewSource?.kind === "comment-revision" &&
        previewSource.revisionId === input.revisionId
      )
    )
  }

  if (input.chatId) {
    return (
      event.chatId === input.chatId ||
      (
        previewSource?.kind === "chat-worktree" &&
        (
          previewSource.conversationId === input.chatId ||
          previewSource.chatId === input.chatId
        )
      )
    )
  }

  return (
    !event.revisionId &&
    !event.chatId &&
    previewSource?.kind !== "comment-revision" &&
    previewSource?.kind !== "chat-worktree"
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null
}

function pathFromRuntimeChange(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (!isRecord(value)) return null
  const path = value.path ?? value.filePath ?? value.file_path ?? value.relativePath
  return typeof path === "string" && path.trim() ? path.trim() : null
}

function runtimeFileChangePaths(payload: Record<string, unknown>): string[] {
  const paths = new Set<string>()
  for (const value of [
    payload.path,
    payload.filePath,
    payload.file_path,
    payload.relativePath,
  ]) {
    const path = pathFromRuntimeChange(value)
    if (path) paths.add(path)
  }

  const addArrayPaths = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const item of value) {
      const path = pathFromRuntimeChange(item)
      if (path) paths.add(path)
    }
  }

  addArrayPaths(payload.files)
  addArrayPaths(payload.changes)
  return Array.from(paths)
}

export function dispatchRuntimeSourceChange(input: {
  payload: Record<string, unknown>
  runtimeContext: AgentRuntimePreviewContext | null | undefined
  chatId?: string | null
  subChatId?: string | null
}) {
  if (typeof window === "undefined") return
  const changes: HyperframesSourceWatchChange[] = runtimeFileChangePaths(input.payload)
    .map((path) => ({ path, type: "change" as const }))
  if (changes.length === 0 && !input.payload.diff) return

  const detail: HyperframesRuntimeSourceChangeEvent = {
    source: "agent-runtime",
    projectId: input.runtimeContext?.projectId ?? null,
    compositionId: input.runtimeContext?.compositionId ?? null,
    revisionId:
      input.runtimeContext?.revisionId ??
      (
        input.runtimeContext?.previewSource?.kind === "comment-revision"
          ? input.runtimeContext.previewSource.revisionId
          : null
      ),
    chatId:
      input.runtimeContext?.previewSource?.kind === "chat-worktree"
        ? (
          input.runtimeContext.previewSource.conversationId ??
          input.runtimeContext.previewSource.chatId ??
          input.chatId ??
          null
        )
        : null,
    subChatId: input.subChatId ?? null,
    previewSource: input.runtimeContext?.previewSource ?? null,
    changes,
    timestamp: Date.now(),
  }

  window.dispatchEvent(new CustomEvent(
    HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT,
    { detail },
  ))
}
