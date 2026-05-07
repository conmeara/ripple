export const HYPERFRAMES_SOURCE_WATCHED_EXTENSIONS = [
  ".html",
  ".css",
  ".js",
  ".json",
] as const

export type HyperframesSourceWatchChangeType = "add" | "change" | "unlink"

export interface HyperframesSourceWatchChange {
  path: string
  type: HyperframesSourceWatchChangeType
}

export interface HyperframesSourceWatchEvent {
  projectId: string
  contextKey: string
  projectPath: string
  changes: HyperframesSourceWatchChange[]
  timestamp: number
  subscriptionKey: string
}

export type HyperframesRuntimePreviewSource =
  | { kind: "main" }
  | { kind: "comment-revision"; revisionId: string }
  | { kind: "chat-worktree"; conversationId?: string | null; chatId?: string | null }
  | { kind: "export"; exportJobId?: string | null; sourceLabel?: string | null }

export const HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT =
  "ripple:hyperframes-runtime-source-changed"

export interface HyperframesRuntimeSourceChangeEvent {
  source: "agent-runtime"
  projectId?: string | null
  compositionId?: string | null
  revisionId?: string | null
  chatId?: string | null
  subChatId?: string | null
  previewSource?: HyperframesRuntimePreviewSource | null
  changes: HyperframesSourceWatchChange[]
  timestamp: number
}

export type HyperframesSourceRefreshEvent =
  | HyperframesSourceWatchEvent
  | HyperframesRuntimeSourceChangeEvent

export interface HyperframesSourceWatchSubscriptionInput {
  projectId: string
  revisionId?: string | null
  chatId?: string | null
}

export interface HyperframesSourceWatchSubscription {
  subscriptionKey: string
  contextKey: string
  projectPath: string
}
