import type { RippleTimelineClip } from "./hyperframes-timeline-model"

const IMAGE_EXT = /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/i
const VIDEO_EXT = /\.(?:m4v|mov|mp4|webm)$/i
const AUDIO_EXT = /\.(?:aac|aif|aiff|flac|m4a|mp3|ogg|wav)$/i

const TIME_PRECISION = 100
const EDGE_TRACK_CREATE_THRESHOLD = 0.55
const FALLBACK_TIMELINE_FILE_DROP_DURATION = 5

export const RIPPLE_TIMELINE_ASSET_MIME = "application/x-ripple-timeline-asset"
export const HYPERFRAMES_TIMELINE_ASSET_MIME = "application/x-hyperframes-asset"

export type RippleTimelineAssetKind = "image" | "video" | "audio"
export type RippleTimelineBlockedEditIntent = "move" | "resize-start" | "resize-end"

export interface RippleTimelineMoveInput {
  start: number
  track: number
  duration: number
  originClientX: number
  originClientY: number
  originScrollLeft?: number
  originScrollTop?: number
  currentScrollLeft?: number
  currentScrollTop?: number
  pixelsPerSecond: number
  trackHeight: number
  maxStart: number
  trackOrder: number[]
}

export interface RippleTimelineResizeInput {
  start: number
  duration: number
  originClientX: number
  pixelsPerSecond: number
  minStart: number
  maxEnd: number
  minDuration?: number
  playbackStart?: number
  playbackRate?: number
  seedPlaybackStart?: boolean
}

export interface RippleTimelineEditCapabilities {
  canMove: boolean
  canTrimStart: boolean
  canTrimEnd: boolean
}

export interface RippleTimelineAssetDropPlacementInput {
  rectLeft: number
  rectTop: number
  scrollLeft: number
  scrollTop: number
  pixelsPerSecond: number
  duration: number
  trackHeight: number
  trackOrder: number[]
  gutterWidth: number
  rulerHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function roundToCentiseconds(value: number): number {
  return Math.round(value * TIME_PRECISION) / TIME_PRECISION
}

export function getTimelineAssetKind(assetPath: string): RippleTimelineAssetKind | null {
  if (IMAGE_EXT.test(assetPath)) return "image"
  if (VIDEO_EXT.test(assetPath)) return "video"
  if (AUDIO_EXT.test(assetPath)) return "audio"
  return null
}

export function buildTimelineAssetId(assetPath: string, existingIds: Iterable<string>): string {
  const baseName = assetPath.split("/").pop() ?? "asset"
  const normalized = baseName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
  const baseId = normalized || "asset"
  const ids = new Set(existingIds)
  if (!ids.has(baseId)) return baseId

  let suffix = 2
  while (ids.has(`${baseId}_${suffix}`)) suffix += 1
  return `${baseId}_${suffix}`
}

export function resolveTimelineAssetSrc(targetPath: string, assetPath: string): string {
  const targetDir = targetPath.includes("/")
    ? targetPath.slice(0, targetPath.lastIndexOf("/"))
    : ""
  if (!targetDir) return assetPath

  const fromParts = targetDir.split("/").filter(Boolean)
  const toParts = assetPath.split("/").filter(Boolean)
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift()
    toParts.shift()
  }

  const up = fromParts.map(() => "..")
  const relative = [...up, ...toParts].join("/")
  return relative || assetPath.split("/").pop() || assetPath
}

export function buildTimelineFileDropPlacements(
  placement: { start: number; track: number },
  durations: number[],
  occupiedClips: Array<{ start: number; duration: number; track: number }> = [],
): Array<{ start: number; track: number }> {
  let nextStart = roundToCentiseconds(Math.max(0, placement.start))
  const sequenceStart = nextStart
  const resolvedDurations = durations.map((duration) =>
    Number.isFinite(duration) && duration > 0 ? duration : FALLBACK_TIMELINE_FILE_DROP_DURATION,
  )
  const sequenceEnd = resolvedDurations.reduce(
    (end, duration) => roundToCentiseconds(end + duration),
    sequenceStart,
  )
  const overlapsDropTrack = occupiedClips.some((clip) => {
    if (clip.track !== placement.track) return false
    const clipStart = Math.max(0, clip.start)
    const clipEnd = clipStart + Math.max(0, clip.duration)
    return sequenceStart < clipEnd && sequenceEnd > clipStart
  })
  const track = overlapsDropTrack
    ? Math.max(placement.track, ...occupiedClips.map((clip) => clip.track)) + 1
    : placement.track

  return resolvedDurations.map((duration) => {
    const start = nextStart
    nextStart = roundToCentiseconds(nextStart + duration)
    return { start, track }
  })
}

export function resolveTimelineAssetDrop(
  input: RippleTimelineAssetDropPlacementInput,
  clientX: number,
  clientY: number,
): { start: number; track: number } {
  const x = clientX - input.rectLeft + input.scrollLeft - input.gutterWidth
  const y = clientY - input.rectTop + input.scrollTop - input.rulerHeight
  const start = clamp(
    roundToCentiseconds(x / Math.max(input.pixelsPerSecond, 1)),
    0,
    Math.max(0, input.duration),
  )
  const rowIndex = Math.floor(y / Math.max(input.trackHeight, 1))
  return {
    start,
    track: getDefaultDroppedTrack(input.trackOrder, rowIndex),
  }
}

export function getDefaultDroppedTrack(trackOrder: number[], rowIndex?: number): number {
  if (trackOrder.length === 0) return 0
  if (rowIndex == null || rowIndex < 0) return trackOrder[0] ?? 0
  if (rowIndex >= trackOrder.length) {
    return Math.max(...trackOrder) + 1
  }
  return trackOrder[rowIndex] ?? trackOrder[trackOrder.length - 1] ?? 0
}

export function resolveTimelineMove(
  input: RippleTimelineMoveInput,
  clientX: number,
  clientY: number,
): { start: number; track: number } {
  const trackOrder = input.trackOrder.length > 0 ? input.trackOrder : [input.track]
  const scrollDeltaX = (input.currentScrollLeft ?? 0) - (input.originScrollLeft ?? 0)
  const scrollDeltaY = (input.currentScrollTop ?? 0) - (input.originScrollTop ?? 0)
  const deltaTime =
    (clientX - input.originClientX + scrollDeltaX) / Math.max(input.pixelsPerSecond, 1)
  const trackDeltaRaw =
    (clientY - input.originClientY + scrollDeltaY) / Math.max(input.trackHeight, 1)
  const deltaTrack = Math.round(trackDeltaRaw)
  const currentTrackIndex = Math.max(0, trackOrder.indexOf(input.track))
  const desiredTrackIndex = currentTrackIndex + deltaTrack
  const nextTrackIndex = clamp(desiredTrackIndex, 0, Math.max(0, trackOrder.length - 1))
  const minTrack = Math.min(...trackOrder)
  const maxTrack = Math.max(...trackOrder)
  let nextTrack = trackOrder[nextTrackIndex] ?? input.track

  const startedOnFirstTrack = currentTrackIndex === 0
  const startedOnLastTrack = currentTrackIndex === trackOrder.length - 1

  if (
    startedOnFirstTrack &&
    desiredTrackIndex < 0 &&
    currentTrackIndex + trackDeltaRaw <= -EDGE_TRACK_CREATE_THRESHOLD
  ) {
    nextTrack = minTrack - 1
  } else if (
    startedOnLastTrack &&
    desiredTrackIndex > trackOrder.length - 1 &&
    currentTrackIndex + trackDeltaRaw >= trackOrder.length - 1 + EDGE_TRACK_CREATE_THRESHOLD
  ) {
    nextTrack = maxTrack + 1
  }

  return {
    start: clamp(roundToCentiseconds(input.start + deltaTime), 0, Math.max(0, input.maxStart)),
    track: Math.max(0, Math.round(nextTrack)),
  }
}

export function buildTrackZIndexMap(tracks: number[]): Map<number, number> {
  const uniqueTracks = Array.from(new Set(
    tracks
      .filter((track) => Number.isFinite(track))
      .map((track) => Math.max(0, Math.round(track))),
  )).sort((a, b) => a - b)
  const maxZIndex = uniqueTracks.length
  return new Map(uniqueTracks.map((track, index) => [track, maxZIndex - index]))
}

export function resolveTimelineResize(
  input: RippleTimelineResizeInput,
  edge: "start" | "end",
  clientX: number,
): { start: number; duration: number; playbackStart?: number } {
  const minDuration = Math.max(0.05, input.minDuration ?? 0.1)
  const deltaTime = (clientX - input.originClientX) / Math.max(input.pixelsPerSecond, 1)

  if (edge === "end") {
    return {
      start: input.start,
      duration: clamp(
        roundToCentiseconds(input.duration + deltaTime),
        minDuration,
        Math.max(minDuration, input.maxEnd - input.start),
      ),
      playbackStart: input.playbackStart,
    }
  }

  const playbackRate = Math.max(0.1, input.playbackRate ?? 1)
  const playbackStartBase =
    input.playbackStart ?? (input.seedPlaybackStart ? 0 : undefined)
  const maxLeftExtensionFromMedia =
    playbackStartBase != null ? playbackStartBase / playbackRate : Number.POSITIVE_INFINITY
  const minDelta = -Math.min(input.start - input.minStart, maxLeftExtensionFromMedia)
  const maxDelta = input.duration - minDuration
  const clampedDelta = clamp(deltaTime, minDelta, maxDelta)

  return {
    start: roundToCentiseconds(input.start + clampedDelta),
    duration: roundToCentiseconds(input.duration - clampedDelta),
    playbackStart:
      playbackStartBase != null
        ? roundToCentiseconds(Math.max(0, playbackStartBase + clampedDelta * playbackRate))
        : undefined,
  }
}

export function getTimelineEditCapabilities(input: {
  tag: string | null
  duration: number
  sourceFile?: string
  domId?: string
  selector?: string
  compositionSrc?: string | null
  playbackStart?: number
  playbackStartAttribute?: RippleTimelineClip["playbackStartAttribute"]
  sourceDuration?: number
}): RippleTimelineEditCapabilities {
  const canPatch = Boolean(input.domId || input.selector || input.sourceFile)
  const hasFiniteDuration = Number.isFinite(input.duration) && input.duration > 0

  return {
    canMove: canPatch,
    canTrimEnd: canPatch && hasFiniteDuration,
    canTrimStart: canPatch && hasFiniteDuration,
  }
}

export function resolveBlockedTimelineEditIntent(input: {
  width: number
  offsetX: number
  handleWidth: number
  capabilities: RippleTimelineEditCapabilities
}): RippleTimelineBlockedEditIntent | null {
  if (input.capabilities.canMove) return null

  const safeWidth = Math.max(0, input.width)
  const safeOffsetX = clamp(input.offsetX, 0, safeWidth)
  const safeHandleWidth = Math.max(0, input.handleWidth)

  if (safeOffsetX <= safeHandleWidth && !input.capabilities.canTrimStart) {
    return "resize-start"
  }
  if (safeOffsetX >= Math.max(0, safeWidth - safeHandleWidth) && !input.capabilities.canTrimEnd) {
    return "resize-end"
  }
  return "move"
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function buildTimelineAssetInsertHtml(input: {
  id: string
  assetPath: string
  kind: RippleTimelineAssetKind
  start: number
  duration: number
  track: number
  zIndex: number
}): string {
  const start = formatTimelineAttributeNumber(input.start)
  const duration = formatTimelineAttributeNumber(input.duration)
  const id = escapeHtmlAttribute(input.id)
  const assetPath = escapeHtmlAttribute(input.assetPath)
  const sharedAttrs =
    `id="${id}" class="clip" src="${assetPath}" data-start="${start}" data-duration="${duration}" data-track-index="${input.track}"`

  if (input.kind === "image") {
    return `<img ${sharedAttrs} style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; z-index: ${input.zIndex}" />`
  }

  if (input.kind === "video") {
    return `<video ${sharedAttrs} muted playsinline style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; z-index: ${input.zIndex}"></video>`
  }

  return `<audio ${sharedAttrs} style="z-index: ${input.zIndex}"></audio>`
}

export function insertTimelineAssetIntoSource(source: string, assetHtml: string): string {
  const rootOpenTag = /<[^>]*data-composition-id=(?:"[^"]+"|'[^']+')[^>]*>/i
  const match = rootOpenTag.exec(source)
  if (!match || match.index == null) {
    throw new Error("No composition root found in target source.")
  }
  const insertAt = match.index + match[0].length
  return `${source.slice(0, insertAt)}${assetHtml}${source.slice(insertAt)}`
}

export function formatTimelineAttributeNumber(value: number): string {
  return Number(roundToCentiseconds(value).toFixed(2)).toString()
}

export function timelineClipEditCapabilities(clip: RippleTimelineClip): RippleTimelineEditCapabilities {
  return getTimelineEditCapabilities({
    tag: clip.tagName,
    duration: clip.duration,
    sourceFile: clip.sourceFile,
    domId: clip.domId,
    selector: clip.selector,
    compositionSrc: clip.compositionSrc,
    playbackStart: clip.playbackStart,
    playbackStartAttribute: clip.playbackStartAttribute,
    sourceDuration: clip.sourceDuration,
  })
}
