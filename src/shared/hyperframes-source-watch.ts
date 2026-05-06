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
