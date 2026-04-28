export const RIPPLE_COMMENT_THREAD_STATUSES = [
  "open",
  "resolved",
  "archived",
] as const

export const RIPPLE_COMMENT_MESSAGE_ROLES = [
  "user",
  "assistant",
  "system",
] as const

export const RIPPLE_REVISION_STATUSES = [
  "queued",
  "preparing",
  "running",
  "updating",
  "proposed",
  "accepted",
  "rejected",
  "superseded",
  "failed",
] as const

export const RIPPLE_COMMENT_FILTERS = [
  "active",
  "resolved",
  "deleted",
  "all",
] as const

export type RippleCommentThreadStatus =
  (typeof RIPPLE_COMMENT_THREAD_STATUSES)[number]
export type RippleCommentMessageRole =
  (typeof RIPPLE_COMMENT_MESSAGE_ROLES)[number]
export type RippleRevisionStatus = (typeof RIPPLE_REVISION_STATUSES)[number]
export type RippleCommentFilter = (typeof RIPPLE_COMMENT_FILTERS)[number]
export type RippleCommentAnchorType = "frame" | "range" | "element"

export interface RippleCommentAnchorInput {
  anchorType?: RippleCommentAnchorType
  startTime?: number | null
  endTime?: number | null
  startFrame?: number | null
  endFrame?: number | null
  elementSelector?: string | null
  clipKey?: string | null
  sourceFile?: string | null
  screenshotPath?: string | null
}

export interface RippleRevisionDiffSummary {
  fileCount: number
  additions: number
  deletions: number
  files: string[]
  summary?: string
}

export interface RippleCommentMessageView {
  id: string
  threadId: string
  revisionId: string | null
  role: RippleCommentMessageRole
  body: string
  metadataJson: string | null
  clientRequestId: string | null
  createdAt: Date | null
}

export interface RippleRevisionView {
  id: string
  threadId: string
  projectId: string
  compositionId: string | null
  chatId: string | null
  subChatId: string | null
  status: RippleRevisionStatus
  previewContextKey: string | null
  diffSummary: string | null
  errorMessage: string | null
  createdAt: Date | null
  updatedAt: Date | null
  resolvedAt: Date | null
}

export interface RippleCommentThreadView {
  id: string
  projectId: string
  compositionId: string | null
  anchorType: RippleCommentAnchorType
  startTime: number
  endTime: number | null
  startFrame: number
  endFrame: number | null
  elementSelector: string | null
  clipKey: string | null
  sourceFile: string | null
  screenshotPath: string | null
  clientRequestId: string | null
  status: RippleCommentThreadStatus
  latestRevisionId: string | null
  createdAt: Date | null
  updatedAt: Date | null
  resolvedAt: Date | null
  deletedAt: Date | null
  messages: RippleCommentMessageView[]
  revisions: RippleRevisionView[]
}

export function getRippleRevisionPreviewProjectId(revisionId: string): string {
  return `revision-${revisionId}`
}

export function parseRippleRevisionPreviewProjectId(
  previewProjectId: string,
): string | null {
  return previewProjectId.startsWith("revision-")
    ? previewProjectId.slice("revision-".length)
    : null
}

export function normalizeCommentAnchor(input: RippleCommentAnchorInput): {
  anchorType: RippleCommentAnchorType
  startTimeMs: number
  endTimeMs: number | null
  startFrame: number
  endFrame: number | null
  elementSelector: string | null
  clipKey: string | null
  sourceFile: string | null
  screenshotPath: string | null
} {
  const rawStartTime = finiteNonNegative(input.startTime) ?? 0
  const rawEndTime = finiteNonNegative(input.endTime)
  const startTime = rawEndTime === null
    ? rawStartTime
    : Math.min(rawStartTime, rawEndTime)
  const endTime = rawEndTime === null
    ? null
    : Math.max(rawStartTime, rawEndTime)
  const startFrame = integerNonNegative(input.startFrame) ?? secondsToFrame(startTime)
  const endFrame = integerNonNegative(input.endFrame)
  const hasRange = endTime !== null && Math.abs(endTime - startTime) > 0.001
  const hasElement = Boolean(input.elementSelector?.trim() || input.clipKey?.trim())

  return {
    anchorType: input.anchorType ?? (hasElement ? "element" : hasRange ? "range" : "frame"),
    startTimeMs: secondsToMs(startTime),
    endTimeMs: endTime === null ? null : secondsToMs(endTime),
    startFrame,
    endFrame: endFrame ?? (endTime === null ? null : secondsToFrame(endTime)),
    elementSelector: nullableTrim(input.elementSelector),
    clipKey: nullableTrim(input.clipKey),
    sourceFile: nullableTrim(input.sourceFile),
    screenshotPath: nullableTrim(input.screenshotPath),
  }
}

export function msToSeconds(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value ?? 0) / 1000
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null
}

function integerNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null
}

function secondsToMs(value: number): number {
  return Math.round(Math.max(0, value) * 1000)
}

function secondsToFrame(value: number): number {
  return Math.max(0, Math.round(value * 30))
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
