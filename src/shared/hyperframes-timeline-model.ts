export const RIPPLE_TIMELINE_FPS = 30
export const MAX_RIPPLE_TIMELINE_SECONDS = 7200

export type RippleTimelineSource = "static-source" | "runtime-manifest"
export type RippleTimelineClipKind =
  | "video"
  | "audio"
  | "image"
  | "caption"
  | "element"
  | "composition"
export type RippleTimelineClipConfidence =
  | "authoritative"
  | "static"
  | "fallback"

export interface RippleTimelineScene {
  id: string
  label: string
  start: number
  duration: number
  thumbnailUrl?: string | null
}

export interface RippleTimelineClip {
  id: string
  key: string
  label: string
  kind: RippleTimelineClipKind
  tagName: string | null
  start: number
  duration: number
  track: number
  sourceFile: string
  selector?: string
  selectorIndex?: number
  domId?: string
  compositionId?: string | null
  parentCompositionId?: string | null
  compositionSrc?: string | null
  assetUrl?: string | null
  playbackStart?: number
  playbackStartAttribute?: "data-media-start" | "data-playback-start"
  sourceDuration?: number
  volume?: number
  timelineRole?: string | null
  timelineGroup?: string | null
  timelinePriority?: number | null
  compositionAncestors?: string[]
  editable: boolean
  confidence: RippleTimelineClipConfidence
}

export interface RippleTimelineModel {
  projectId: string
  compositionId: string
  filePath: string
  source: RippleTimelineSource
  fps: number
  durationSeconds: number | null
  durationFrames: number | null
  width: number
  height: number
  clips: RippleTimelineClip[]
  scenes: RippleTimelineScene[]
}

export interface RippleTimelineRuntimeClip {
  id?: string | null
  label?: string | null
  start?: number | null
  duration?: number | null
  track?: number | null
  kind?: RippleTimelineClipKind | string | null
  tagName?: string | null
  compositionId?: string | null
  parentCompositionId?: string | null
  compositionSrc?: string | null
  assetUrl?: string | null
  playbackStart?: number | null
  playbackStartAttr?: string | null
  playbackStartAttribute?: string | null
  sourceDuration?: number | null
  volume?: number | null
  compositionAncestors?: string[] | null
  timelineRole?: string | null
  timelineLabel?: string | null
  timelineGroup?: string | null
  timelinePriority?: number | null
}

export interface RippleTimelineRuntimeManifest {
  clips?: RippleTimelineRuntimeClip[]
  scenes?: Array<{
    id?: string | null
    label?: string | null
    start?: number | null
    duration?: number | null
    thumbnailUrl?: string | null
  }>
  durationInFrames?: number | null
}

export interface RippleTimelineRuntimeContext {
  projectId: string
  compositionId: string
  filePath: string
  width: number
  height: number
  fps?: number
}

export interface RippleTimelineTrack {
  track: number
  clips: RippleTimelineClip[]
  kind: RippleTimelineClipKind
  label: string
  timelineRole?: string | null
}

export interface RippleTimelineFrameIndicator {
  frame: number
  totalFrames: number | null
  fps: number
  timecode: string
  label: string
}

export interface RippleTimelineRangeSelection {
  projectId: string
  compositionId: string
  source: RippleTimelineSource
  confidence: RippleTimelineClipConfidence
  startTime: number
  endTime: number
  startFrame: number
  endFrame: number
  clipKey?: string
  selector?: string
  sourceFile?: string
}

export interface RippleTimelineTickSet {
  major: number[]
  minor: number[]
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function clampRippleTimelineTime(
  value: number,
  duration: number | null | undefined,
): number {
  if (!Number.isFinite(value)) return 0
  const max = typeof duration === "number" && Number.isFinite(duration)
    ? Math.max(0, duration)
    : MAX_RIPPLE_TIMELINE_SECONDS
  return Math.min(max, Math.max(0, value))
}

export function normalizeRippleTimelineDuration(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number === null || number <= 0 || number >= MAX_RIPPLE_TIMELINE_SECONDS) {
    return null
  }
  return roundTimelineSecond(number)
}

export function roundTimelineSecond(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

export function timelineSecondsToFrame(seconds: number, fps = RIPPLE_TIMELINE_FPS): number {
  if (!Number.isFinite(seconds)) return 0
  return Math.max(0, Math.round(seconds * fps))
}

export function timelineFrameToSeconds(frame: number, fps = RIPPLE_TIMELINE_FPS): number {
  if (!Number.isFinite(frame) || fps <= 0) return 0
  return roundTimelineSecond(Math.max(0, frame) / fps)
}

export function getTimelineFrameIndicator(input: {
  time: number
  duration?: number | null
  fps?: number | null
}): RippleTimelineFrameIndicator {
  const fps =
    typeof input.fps === "number" && Number.isFinite(input.fps) && input.fps > 0
      ? Math.round(input.fps)
      : RIPPLE_TIMELINE_FPS
  const duration =
    typeof input.duration === "number" && Number.isFinite(input.duration) && input.duration > 0
      ? input.duration
      : null
  const totalFrames = duration !== null ? timelineSecondsToFrame(duration, fps) : null
  const frame = totalFrames !== null
    ? Math.min(totalFrames, timelineSecondsToFrame(clampRippleTimelineTime(input.time, duration), fps))
    : timelineSecondsToFrame(input.time, fps)

  return {
    frame,
    totalFrames,
    fps,
    timecode: formatTimelineTimecode(timelineFrameToSeconds(frame, fps), fps),
    label: totalFrames !== null ? `Frame ${frame} / ${totalFrames}` : `Frame ${frame}`,
  }
}

export function formatTimelineTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

export function formatTimelineTimecode(
  seconds: number,
  fps = RIPPLE_TIMELINE_FPS,
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00:00"
  const totalFrames = timelineSecondsToFrame(seconds, fps)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  return [
    hours,
    minutes,
    remainingSeconds,
    frames,
  ]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
}

export function labelFromTimelineIdentifier(value: string | null | undefined): string {
  if (!value?.trim()) return "Clip"
  const base = value
    .replace(/\.[a-z0-9]+$/i, "")
    .split("/")
    .pop() ?? value

  return base
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Clip"
}

export function sortTimelineClips(clips: RippleTimelineClip[]): RippleTimelineClip[] {
  return [...clips].sort((a, b) => {
    if (a.track !== b.track) return a.track - b.track
    if (a.start !== b.start) return a.start - b.start
    const priorityA = finiteNumber(a.timelinePriority) ?? 0
    const priorityB = finiteNumber(b.timelinePriority) ?? 0
    if (priorityA !== priorityB) return priorityA - priorityB
    return a.label.localeCompare(b.label)
  })
}

export function isCaptionTimelineClip(clip: Pick<
  RippleTimelineClip,
  "kind" | "label" | "tagName" | "timelineRole" | "timelineGroup"
>): boolean {
  if (clip.kind === "caption") return true
  const role = clip.timelineRole?.toLowerCase() ?? ""
  const group = clip.timelineGroup?.toLowerCase() ?? ""
  const label = clip.label.toLowerCase()
  if (role.includes("caption") || group.includes("caption")) return true
  if (label.includes("caption") || label.includes("subtitle")) return true
  return clip.tagName?.toLowerCase() === "span" && role.includes("text")
}

function timelineTrackKind(clips: RippleTimelineClip[]): RippleTimelineClipKind {
  const firstCaption = clips.find(isCaptionTimelineClip)
  if (firstCaption) return "caption"
  const firstComposition = clips.find((clip) => clip.kind === "composition")
  if (firstComposition) return "composition"
  return clips[0]?.kind ?? "element"
}

function timelineTrackLabel(input: {
  track: number
  kind: RippleTimelineClipKind
  clips: RippleTimelineClip[]
}): string {
  if (input.kind === "caption") return "Captions"
  if (input.kind === "composition") return "Composition"
  if (input.kind === "video") return "Video"
  if (input.kind === "audio") return "Audio"
  if (input.kind === "image") return "Images"
  const firstRole = input.clips.find((clip) => clip.timelineRole)?.timelineRole
  if (firstRole) return labelFromTimelineIdentifier(firstRole)
  return `Track ${input.track + 1}`
}

export function groupTimelineClipsByTrack(
  clips: RippleTimelineClip[],
): RippleTimelineTrack[] {
  const tracks = new Map<number, RippleTimelineClip[]>()
  for (const clip of sortTimelineClips(clips)) {
    const track = Number.isFinite(clip.track) ? Math.max(0, Math.round(clip.track)) : 0
    const existing = tracks.get(track) ?? []
    existing.push(clip)
    tracks.set(track, existing)
  }

  return Array.from(tracks.entries())
    .sort(([a], [b]) => a - b)
    .map(([track, trackClips]) => {
      const kind = timelineTrackKind(trackClips)
      return {
        track,
        clips: trackClips,
        kind,
        label: timelineTrackLabel({ track, kind, clips: trackClips }),
        timelineRole: trackClips.find((clip) => clip.timelineRole)?.timelineRole ?? null,
      }
    })
}

export function getActiveTimelineClips(input: {
  model: RippleTimelineModel | null
  time: number
  includeEndingFrame?: boolean
}): RippleTimelineClip[] {
  const model = input.model
  if (!model || !Number.isFinite(input.time)) return []
  const time = Math.max(0, input.time)
  const epsilon = 0.001

  return sortTimelineClips(model.clips).filter((clip) => {
    const start = Math.max(0, clip.start)
    const end = start + Math.max(0, clip.duration)
    if (input.includeEndingFrame) {
      return time >= start - epsilon && time <= end + epsilon
    }
    return time >= start - epsilon && time < end - epsilon
  })
}

export function getActiveCaptionOverlayClips(input: {
  model: RippleTimelineModel | null
  time: number
  limit?: number
}): RippleTimelineClip[] {
  const limit = Math.max(1, Math.round(input.limit ?? 3))
  return getActiveTimelineClips({
    model: input.model,
    time: input.time,
  })
    .filter(isCaptionTimelineClip)
    .slice(0, limit)
}

export function getTimelineDurationFromClips(
  clips: Pick<RippleTimelineClip, "start" | "duration">[],
): number | null {
  const end = clips.reduce((current, clip) => {
    const start = finiteNumber(clip.start) ?? 0
    const duration = finiteNumber(clip.duration) ?? 0
    return Math.max(current, start + duration)
  }, 0)

  return normalizeRippleTimelineDuration(end)
}

function isGenericRuntimeLabel(value: string | null | undefined): boolean {
  if (!value) return false
  return /^(?:node index \d+|__node__index_\d+)$/i.test(value.trim())
}

function isBetterCompositionDuplicate(
  clip: RippleTimelineClip,
  candidate: RippleTimelineClip,
): boolean {
  if (clip.key === candidate.key) return false
  if (!isGenericRuntimeLabel(clip.label)) return false

  const sameTime =
    Math.abs(clip.start - candidate.start) < 0.001 &&
    Math.abs(clip.duration - candidate.duration) < 0.001
  if (!sameTime) return false

  const sameComposition =
    (clip.compositionId && clip.compositionId === candidate.compositionId) ||
    (clip.compositionId && clip.compositionId === candidate.id) ||
    (candidate.compositionId && candidate.compositionId === clip.id) ||
    (clip.compositionSrc && clip.compositionSrc === candidate.compositionSrc)
  const sameStructuralHost =
    candidate.kind === "composition" &&
    !isGenericRuntimeLabel(candidate.label) &&
    Boolean(candidate.compositionId || candidate.compositionSrc) &&
    (!clip.compositionId || !candidate.compositionId || clip.compositionId === candidate.compositionId) &&
    (!clip.compositionSrc || !candidate.compositionSrc || clip.compositionSrc === candidate.compositionSrc) &&
    (clip.tagName === "div" || clip.tagName === "section" || clip.tagName === "main")

  return Boolean(
    (sameComposition && !isGenericRuntimeLabel(candidate.label)) ||
      sameStructuralHost,
  )
}

export function filterTimelineDisplayClips(
  clips: RippleTimelineClip[],
): RippleTimelineClip[] {
  return sortTimelineClips(clips).filter(
    (clip) => !clips.some((candidate) => isBetterCompositionDuplicate(clip, candidate)),
  )
}

export function generateTimelineTicks(duration: number): RippleTimelineTickSet {
  if (duration <= 0 || !Number.isFinite(duration) || duration > MAX_RIPPLE_TIMELINE_SECONDS) {
    return { major: [], minor: [] }
  }

  const intervals = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]
  const target = duration / 7
  const majorInterval = intervals.find((interval) => interval >= target) ?? 60
  const minorInterval = Math.max(0.125, majorInterval / 2)
  const major: number[] = []
  const minor: number[] = []
  const maxTicks = 600

  for (
    let time = 0;
    time <= duration + 0.001 && major.length + minor.length < maxTicks;
    time += minorInterval
  ) {
    const rounded = Math.round(time * 1000) / 1000
    const remainder = rounded % majorInterval
    const isMajor =
      Math.abs(remainder) < 0.001 ||
      Math.abs(remainder - majorInterval) < 0.001

    if (isMajor) major.push(rounded)
    else minor.push(rounded)
  }

  return { major, minor }
}

export function getTimelineFitPixelsPerSecond(input: {
  duration: number
  viewportWidth: number
  gutterWidth?: number
  minimum?: number
  trailingPadding?: number
}): number {
  if (!Number.isFinite(input.duration) || input.duration <= 0) {
    return input.minimum ?? 72
  }

  const available = Math.max(
    1,
    input.viewportWidth - (input.gutterWidth ?? 112) - (input.trailingPadding ?? 0),
  )
  const fit = available / input.duration
  return Math.max(input.minimum ?? Number.MIN_VALUE, fit)
}

export function getTimelinePixelsPerSecond(input: {
  fitPixelsPerSecond: number
  zoomMode: "fit" | "manual"
  manualZoomPercent: number
}): number {
  const fit = Number.isFinite(input.fitPixelsPerSecond) && input.fitPixelsPerSecond > 0
    ? input.fitPixelsPerSecond
    : 72
  if (input.zoomMode === "fit") return fit

  const zoom = Math.min(800, Math.max(25, Math.round(input.manualZoomPercent)))
  return fit * (zoom / 100)
}

export function getTimelinePlayheadLeft(input: {
  time: number
  pixelsPerSecond: number
  gutterWidth?: number
}): number {
  const gutter = input.gutterWidth ?? 112
  if (!Number.isFinite(input.time) || !Number.isFinite(input.pixelsPerSecond)) return gutter
  return gutter + Math.max(0, input.time) * Math.max(0, input.pixelsPerSecond)
}

export function buildTimelineRangeSelection(input: {
  projectId: string
  compositionId: string
  source: RippleTimelineSource
  confidence: RippleTimelineClipConfidence
  startTime: number
  endTime: number
  fps?: number
  clip?: RippleTimelineClip | null
}): RippleTimelineRangeSelection {
  const fps = input.fps ?? RIPPLE_TIMELINE_FPS
  const startTime = roundTimelineSecond(Math.min(input.startTime, input.endTime))
  const endTime = roundTimelineSecond(Math.max(input.startTime, input.endTime))

  return {
    projectId: input.projectId,
    compositionId: input.compositionId,
    source: input.source,
    confidence: input.clip?.confidence ?? input.confidence,
    startTime,
    endTime,
    startFrame: timelineSecondsToFrame(startTime, fps),
    endFrame: timelineSecondsToFrame(endTime, fps),
    clipKey: input.clip?.key,
    selector: input.clip?.selector,
    sourceFile: input.clip?.sourceFile,
  }
}

function hasCaptionMetadata(input: {
  kind?: unknown
  label?: string | null
  tagName?: string | null
  timelineRole?: string | null
  timelineGroup?: string | null
}): boolean {
  if (input.kind === "caption") return true
  const role = input.timelineRole?.toLowerCase() ?? ""
  const group = input.timelineGroup?.toLowerCase() ?? ""
  const label = input.label?.toLowerCase() ?? ""
  const tagName = input.tagName?.toLowerCase() ?? ""
  return (
    role.includes("caption") ||
    group.includes("caption") ||
    label.includes("caption") ||
    label.includes("subtitle") ||
    (tagName === "span" && role.includes("text"))
  )
}

function normalizeRuntimeClipKind(clip: RippleTimelineRuntimeClip): RippleTimelineClipKind {
  if (hasCaptionMetadata(clip)) return "caption"
  const value = clip.kind
  if (
    value === "video" ||
    value === "audio" ||
    value === "image" ||
    value === "caption" ||
    value === "composition"
  ) {
    return value
  }
  return "element"
}

function normalizePlaybackStartAttribute(
  value: string | null | undefined,
): RippleTimelineClip["playbackStartAttribute"] {
  if (value === "data-media-start" || value === "media-start") return "data-media-start"
  if (value === "data-playback-start" || value === "playback-start") {
    return "data-playback-start"
  }
  return undefined
}

function normalizeRuntimeClip(input: {
  clip: RippleTimelineRuntimeClip
  index: number
  filePath: string
  durationSeconds: number | null
}): RippleTimelineClip | null {
  const start = roundTimelineSecond(finiteNumber(input.clip.start) ?? 0)
  const duration = normalizeRippleTimelineDuration(input.clip.duration)
  if (duration === null) return null
  if (input.durationSeconds !== null && start >= input.durationSeconds) return null

  const clippedDuration = input.durationSeconds !== null
    ? Math.min(duration, Math.max(0, input.durationSeconds - start))
    : duration
  if (clippedDuration <= 0) return null

  const id =
    input.clip.id?.trim() ||
    input.clip.compositionId?.trim() ||
    input.clip.label?.trim() ||
    input.clip.tagName?.trim() ||
    `clip-${input.index + 1}`
  const sourceFile = input.filePath
  const selector = input.clip.id ? `#${input.clip.id}` : undefined
  const label =
    input.clip.timelineLabel?.trim() ||
    input.clip.label?.trim() ||
    labelFromTimelineIdentifier(input.clip.compositionId ?? input.clip.id ?? input.clip.assetUrl ?? id)

  return {
    id,
    key: `${sourceFile}:${id}:${input.index}`,
    label,
    kind: normalizeRuntimeClipKind(input.clip),
    tagName: input.clip.tagName ?? null,
    start,
    duration: roundTimelineSecond(clippedDuration),
    track: Math.max(0, Math.round(finiteNumber(input.clip.track) ?? 0)),
    sourceFile,
    selector,
    domId: input.clip.id ?? undefined,
    compositionId: input.clip.compositionId ?? null,
    parentCompositionId: input.clip.parentCompositionId ?? null,
    compositionSrc: input.clip.compositionSrc ?? null,
    assetUrl: input.clip.assetUrl ?? null,
    playbackStart: finiteNumber(input.clip.playbackStart) ?? undefined,
    playbackStartAttribute: normalizePlaybackStartAttribute(
      input.clip.playbackStartAttribute ?? input.clip.playbackStartAttr,
    ),
    sourceDuration: finiteNumber(input.clip.sourceDuration) ?? undefined,
    volume: finiteNumber(input.clip.volume) ?? undefined,
    timelineRole: input.clip.timelineRole ?? null,
    timelineGroup: input.clip.timelineGroup ?? null,
    timelinePriority: finiteNumber(input.clip.timelinePriority) ?? null,
    compositionAncestors: Array.isArray(input.clip.compositionAncestors)
      ? input.clip.compositionAncestors.filter((ancestor): ancestor is string => typeof ancestor === "string")
      : [],
    editable: false,
    confidence: "authoritative",
  }
}

export function normalizeRuntimeTimelineManifest(input: {
  context: RippleTimelineRuntimeContext
  manifest: RippleTimelineRuntimeManifest
}): RippleTimelineModel | null {
  const fps = input.context.fps ?? RIPPLE_TIMELINE_FPS
  const runtimeClips = Array.isArray(input.manifest.clips) ? input.manifest.clips : []
  const durationFromFrames = normalizeRippleTimelineDuration(
    finiteNumber(input.manifest.durationInFrames) !== null
      ? (finiteNumber(input.manifest.durationInFrames) ?? 0) / fps
      : null,
  )

  const clipCompositionIds = new Set(
    runtimeClips
      .map((clip) => clip.compositionId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  )
  const rootRuntimeClips = runtimeClips.filter((clip) => {
    if (!clip.parentCompositionId) return true
    return !clipCompositionIds.has(clip.parentCompositionId)
  })
  const clips = filterTimelineDisplayClips(
    rootRuntimeClips.flatMap((clip, index) => {
      const normalized = normalizeRuntimeClip({
        clip,
        index,
        filePath: input.context.filePath,
        durationSeconds: durationFromFrames,
      })
      return normalized ? [normalized] : []
    }),
  )
  const durationSeconds = durationFromFrames ?? getTimelineDurationFromClips(clips)
  const durationFrames = durationSeconds !== null
    ? timelineSecondsToFrame(durationSeconds, fps)
    : null

  if (clips.length === 0 && durationSeconds === null) return null

  const scenes = Array.isArray(input.manifest.scenes)
    ? input.manifest.scenes.flatMap((scene, index): RippleTimelineScene[] => {
        const start = roundTimelineSecond(finiteNumber(scene.start) ?? 0)
        const duration = normalizeRippleTimelineDuration(scene.duration)
        if (duration === null) return []
        return [{
          id: scene.id?.trim() || `scene-${index + 1}`,
          label: scene.label?.trim() || `Scene ${index + 1}`,
          start,
          duration,
          thumbnailUrl: scene.thumbnailUrl ?? null,
        }]
      })
    : []

  return {
    projectId: input.context.projectId,
    compositionId: input.context.compositionId,
    filePath: input.context.filePath,
    source: "runtime-manifest",
    fps,
    durationSeconds,
    durationFrames,
    width: input.context.width,
    height: input.context.height,
    clips,
    scenes,
  }
}
