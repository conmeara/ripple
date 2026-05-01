import { lstat, readFile, realpath, writeFile } from "node:fs/promises"
import type { Composition } from "../db/schema"
import {
  buildTrackZIndexMap,
  formatTimelineAttributeNumber,
  timelineClipEditCapabilities,
} from "../../../shared/hyperframes-timeline-editing"
import {
  normalizeRippleTimelineDuration,
  roundTimelineSecond,
  type RippleTimelineClip,
} from "../../../shared/hyperframes-timeline-model"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "./project-context"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { buildHyperframesStaticTimelineModel } from "./timeline-model"
import type { HyperframesProjectContext } from "./types"
import { HyperframesError } from "./types"

const MIN_TIMELINE_CLIP_DURATION_SECONDS = 0.05
const TIMELINE_EDIT_EPSILON = 0.005

export interface HyperframesTimelineClipTarget {
  key?: string | null
  sourceFile?: string | null
  domId?: string | null
  selector?: string | null
  selectorIndex?: number | null
  label?: string | null
  tagName?: string | null
  start?: number | null
  duration?: number | null
  track?: number | null
}

export interface HyperframesTimelineClipUpdateInput {
  context: HyperframesProjectContext
  composition: Composition
  clip: HyperframesTimelineClipTarget
  start: number
  duration: number
  track: number
  playbackStart?: number | null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function nearlyEqual(a: number | undefined, b: number | undefined): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) <= TIMELINE_EDIT_EPSILON
}

async function assertEditableCompositionSource(input: {
  context: HyperframesProjectContext
  filePath: string
}): Promise<string> {
  const absoluteSourcePath = resolveProjectRelativePath(input.context, input.filePath)
  const stats = await lstat(absoluteSourcePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new HyperframesError(
      "This composition source is not a regular project file.",
      "TIMELINE_SOURCE_NOT_FILE",
    )
  }

  const [projectRealPath, sourceRealPath] = await Promise.all([
    realpath(input.context.projectPath),
    realpath(absoluteSourcePath),
  ])
  if (!isPathInsideDirectory(projectRealPath, sourceRealPath)) {
    throw new HyperframesError(
      "This composition source resolves outside the project.",
      "TIMELINE_SOURCE_PATH_ESCAPE",
    )
  }

  return absoluteSourcePath
}

interface OpeningTagMatch {
  tag: string
  start: number
  end: number
  attributes: Map<string, string>
}

function readTagAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>()
  const attributePattern = /([:@A-Za-z0-9_-]+)\s*=\s*(["'])([\s\S]*?)\2/g
  let match: RegExpExecArray | null
  while ((match = attributePattern.exec(tag)) !== null) {
    attributes.set(match[1].toLowerCase(), match[3])
  }
  return attributes
}

function findOpeningTagEnd(html: string, start: number): number {
  let quote: string | null = null
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === "\"" || character === "'") {
      quote = character
      continue
    }
    if (character === ">") return index + 1
  }
  return -1
}

function* openingTags(html: string): Iterable<OpeningTagMatch> {
  let cursor = 0
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor)
    if (start < 0) return
    const next = html[start + 1]
    if (!next || next === "/" || next === "!" || next === "?") {
      cursor = start + 1
      continue
    }

    const end = findOpeningTagEnd(html, start)
    if (end < 0) return
    const tag = html.slice(start, end)
    yield {
      tag,
      start,
      end,
      attributes: readTagAttributes(tag),
    }
    cursor = end
  }
}

function selectorId(selector: string | null | undefined): string | null {
  const match = selector?.match(/^#(.+)$/)
  return match?.[1] ?? null
}

function selectorCompositionId(selector: string | null | undefined): string | null {
  const match = selector?.match(/^\[data-composition-id=(["'])([^"']+)\1\]$/)
  return match?.[2] ?? null
}

function selectorClass(selector: string | null | undefined): string | null {
  const match = selector?.match(/^\.([A-Za-z0-9_-]+)$/)
  return match?.[1] ?? null
}

function hasClass(attributes: Map<string, string>, className: string): boolean {
  return (attributes.get("class") ?? "")
    .split(/\s+/)
    .some((part) => part === className)
}

function findOpeningTagByTarget(
  html: string,
  target: HyperframesTimelineClipTarget,
): OpeningTagMatch | null {
  const targetId = target.domId ?? selectorId(target.selector)
  if (targetId) {
    for (const tag of openingTags(html)) {
      if (tag.attributes.get("id") === targetId) return tag
    }
  }

  const compositionId = selectorCompositionId(target.selector)
  if (compositionId) {
    for (const tag of openingTags(html)) {
      if (tag.attributes.get("data-composition-id") === compositionId) return tag
    }
  }

  const className = selectorClass(target.selector)
  if (className) {
    const selectorIndex = Math.max(0, Math.round(target.selectorIndex ?? 0))
    let currentIndex = 0
    for (const tag of openingTags(html)) {
      if (!hasClass(tag.attributes, className)) continue
      if (currentIndex === selectorIndex) return tag
      currentIndex += 1
    }
  }

  return null
}

function replaceOpeningTag(
  html: string,
  match: OpeningTagMatch,
  nextTag: string,
): string {
  return `${html.slice(0, match.start)}${nextTag}${html.slice(match.end)}`
}

function patchAttributeInTag(tag: string, attribute: string, value: string): string {
  const escapedAttribute = escapeRegex(attribute)
  const escapedValue = escapeHtmlAttribute(value)
  const attributePattern = new RegExp(
    `(\\s${escapedAttribute}\\s*=\\s*)(["'])([\\s\\S]*?)(\\2)`,
    "i",
  )
  if (attributePattern.test(tag)) {
    return tag.replace(
      attributePattern,
      (_match: string, prefix: string) => `${prefix}"${escapedValue}"`,
    )
  }
  return tag.replace(/(\s*\/?>)$/s, ` ${attribute}="${escapedValue}"$1`)
}

function parseStyle(style: string): Map<string, string> {
  const properties = new Map<string, string>()
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":")
    if (colon < 0) continue
    const key = declaration.slice(0, colon).trim()
    const value = declaration.slice(colon + 1).trim()
    if (key) properties.set(key, value)
  }
  return properties
}

function patchStylePropertyInTag(tag: string, property: string, value: string): string {
  const stylePattern = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/i
  const match = stylePattern.exec(tag)
  const properties = parseStyle(match?.[2] ?? "")
  properties.set(property, value)
  const nextStyle = Array.from(properties.entries())
    .map(([key, propertyValue]) => `${key}: ${propertyValue}`)
    .join("; ")

  if (match) {
    return tag.replace(stylePattern, ` style="${escapeHtmlAttribute(nextStyle)}"`)
  }
  return tag.replace(/(\s*\/?>)$/s, ` style="${escapeHtmlAttribute(nextStyle)}"$1`)
}

function targetForClip(clip: RippleTimelineClip): HyperframesTimelineClipTarget {
  return {
    key: clip.key,
    sourceFile: clip.sourceFile,
    domId: clip.domId ?? null,
    selector: clip.selector ?? null,
    selectorIndex: clip.selectorIndex ?? null,
  }
}

function findClipTarget(
  clips: RippleTimelineClip[],
  target: HyperframesTimelineClipTarget,
): RippleTimelineClip | null {
  const normalizedSourceFile = target.sourceFile
    ? normalizeProjectRelativePath(target.sourceFile)
    : null

  if (target.key) {
    const byKey = clips.find((clip) => clip.key === target.key)
    if (byKey) return byKey
  }

  if (target.domId) {
    const byDomId = clips.find((clip) => (
      clip.domId === target.domId &&
      (!normalizedSourceFile || clip.sourceFile === normalizedSourceFile)
    ))
    if (byDomId) return byDomId
  }

  if (target.selector) {
    const selectorIndex = target.selectorIndex ?? undefined
    const bySelector = clips.find((clip) => (
      clip.selector === target.selector &&
      (selectorIndex == null || clip.selectorIndex === selectorIndex) &&
      (!normalizedSourceFile || clip.sourceFile === normalizedSourceFile)
    ))
    if (bySelector) return bySelector
  }

  const originalStart = typeof target.start === "number" && Number.isFinite(target.start)
    ? target.start
    : null
  const originalDuration = typeof target.duration === "number" && Number.isFinite(target.duration)
    ? target.duration
    : null
  const originalTrack = typeof target.track === "number" && Number.isFinite(target.track)
    ? Math.max(0, Math.round(target.track))
    : null
  const normalizedTagName = target.tagName?.toLowerCase() ?? null
  const normalizedLabel = target.label?.trim().toLowerCase() ?? null
  const timingCandidates = clips.filter((clip) => {
    if (normalizedSourceFile && clip.sourceFile !== normalizedSourceFile) return false
    if (normalizedTagName && clip.tagName?.toLowerCase() !== normalizedTagName) return false
    if (originalTrack !== null && clip.track !== originalTrack) return false
    if (originalStart !== null && !nearlyEqual(clip.start, originalStart)) return false
    if (originalDuration !== null && !nearlyEqual(clip.duration, originalDuration)) return false
    return true
  })

  if (timingCandidates.length === 1) return timingCandidates[0]

  if (normalizedLabel && timingCandidates.length > 1) {
    const byLabel = timingCandidates.filter(
      (clip) => clip.label.trim().toLowerCase() === normalizedLabel,
    )
    if (byLabel.length === 1) return byLabel[0]
  }

  return null
}

function normalizeUpdate(input: {
  start: number
  duration: number
  track: number
  compositionDuration: number | null
  playbackStart?: number | null
}): {
  start: number
  duration: number
  track: number
  playbackStart?: number
} {
  const requestedDuration = normalizeRippleTimelineDuration(input.duration)
  const duration = requestedDuration ?? MIN_TIMELINE_CLIP_DURATION_SECONDS
  const start = roundTimelineSecond(Math.max(0, input.start))
  const maxDuration = input.compositionDuration !== null
    ? Math.max(
        MIN_TIMELINE_CLIP_DURATION_SECONDS,
        input.compositionDuration - Math.min(start, input.compositionDuration),
      )
    : duration
  const nextDuration = roundTimelineSecond(Math.max(
    MIN_TIMELINE_CLIP_DURATION_SECONDS,
    Math.min(duration, maxDuration),
  ))
  const maxStart = input.compositionDuration !== null
    ? Math.max(0, input.compositionDuration - nextDuration)
    : start
  const nextStart = roundTimelineSecond(Math.min(start, maxStart))
  const playbackStart = typeof input.playbackStart === "number" &&
    Number.isFinite(input.playbackStart)
    ? roundTimelineSecond(Math.max(0, input.playbackStart))
    : undefined

  return {
    start: nextStart,
    duration: nextDuration,
    track: Math.max(0, Math.round(input.track)),
    playbackStart,
  }
}

function assertClipCanAcceptUpdate(input: {
  clip: RippleTimelineClip
  start: number
  duration: number
  track: number
  playbackStart?: number
}): void {
  const capabilities = timelineClipEditCapabilities(input.clip)
  const normalizedTag = input.clip.tagName?.toLowerCase() ?? ""
  const canUpdatePlaybackOffset =
    input.clip.playbackStartAttribute != null ||
    input.clip.playbackStart != null ||
    normalizedTag === "video" ||
    normalizedTag === "audio"
  const startChanged = !nearlyEqual(input.start, input.clip.start)
  const durationChanged = !nearlyEqual(input.duration, input.clip.duration)
  const trackChanged = input.track !== input.clip.track
  const playbackChanged = !nearlyEqual(input.playbackStart, input.clip.playbackStart)
  const endPreserved = nearlyEqual(
    input.start + input.duration,
    input.clip.start + input.clip.duration,
  )
  const isStartTrim =
    startChanged &&
    durationChanged &&
    endPreserved

  if ((trackChanged || (startChanged && !isStartTrim)) && !capabilities.canMove) {
    throw new HyperframesError(
      "This clip cannot be moved from the timeline.",
      "TIMELINE_CLIP_MOVE_UNSUPPORTED",
    )
  }
  if (isStartTrim && !capabilities.canTrimStart) {
    throw new HyperframesError(
      "This clip cannot be trimmed from the start.",
      "TIMELINE_CLIP_START_TRIM_UNSUPPORTED",
    )
  }
  if (durationChanged && !isStartTrim && !capabilities.canTrimEnd) {
    throw new HyperframesError(
      "This clip cannot be trimmed from the timeline.",
      "TIMELINE_CLIP_END_TRIM_UNSUPPORTED",
    )
  }
  if (playbackChanged && !canUpdatePlaybackOffset) {
    throw new HyperframesError(
      "Only media clips can update playback offset from the timeline.",
      "TIMELINE_CLIP_PLAYBACK_OFFSET_UNSUPPORTED",
    )
  }
}

function playbackStartAttributeForTag(
  tag: OpeningTagMatch,
  clip: RippleTimelineClip,
): "data-media-start" | "data-playback-start" {
  if (tag.attributes.has("data-playback-start")) return "data-playback-start"
  if (tag.attributes.has("data-media-start")) return "data-media-start"
  return clip.playbackStartAttribute ?? "data-media-start"
}

function patchClipOpeningTag(input: {
  source: string
  clip: RippleTimelineClip
  start: number
  duration: number
  track: number
  playbackStart?: number
}): string {
  const match = findOpeningTagByTarget(input.source, targetForClip(input.clip))
  if (!match) {
    throw new HyperframesError(
      "The timeline clip could not be found in the composition source.",
      "TIMELINE_CLIP_TARGET_MISSING",
    )
  }

  let nextTag = patchAttributeInTag(
    match.tag,
    "data-start",
    formatTimelineAttributeNumber(input.start),
  )
  nextTag = patchAttributeInTag(
    nextTag,
    "data-duration",
    formatTimelineAttributeNumber(input.duration),
  )
  nextTag = patchAttributeInTag(nextTag, "data-track-index", String(input.track))

  if (input.playbackStart != null) {
    nextTag = patchAttributeInTag(
      nextTag,
      playbackStartAttributeForTag(match, input.clip),
      formatTimelineAttributeNumber(input.playbackStart),
    )
  }

  return replaceOpeningTag(input.source, match, nextTag)
}

function patchClipZIndexes(input: {
  source: string
  clips: RippleTimelineClip[]
  targetClip: RippleTimelineClip
  targetTrack: number
}): string {
  const trackByKey = new Map(
    input.clips.map((clip) => [
      clip.key,
      clip.key === input.targetClip.key ? input.targetTrack : clip.track,
    ]),
  )
  const zIndexByTrack = buildTrackZIndexMap(Array.from(trackByKey.values()))
  let nextSource = input.source

  for (const clip of input.clips) {
    if (!clip.domId && !clip.selector) continue
    const track = trackByKey.get(clip.key) ?? clip.track
    const zIndex = zIndexByTrack.get(track)
    if (zIndex == null) continue
    const match = findOpeningTagByTarget(nextSource, targetForClip(clip))
    if (!match) continue
    const nextTag = patchStylePropertyInTag(match.tag, "z-index", String(zIndex))
    nextSource = replaceOpeningTag(nextSource, match, nextTag)
  }

  return nextSource
}

export async function updateHyperframesTimelineClip(input: HyperframesTimelineClipUpdateInput) {
  const sourceFilePath = normalizeProjectRelativePath(input.composition.filePath)
  const targetSourceFile = input.clip.sourceFile
    ? normalizeProjectRelativePath(input.clip.sourceFile)
    : sourceFilePath
  if (targetSourceFile !== sourceFilePath) {
    throw new HyperframesError(
      "Timeline edits can only update the active composition source.",
      "TIMELINE_CLIP_SOURCE_MISMATCH",
    )
  }

  const absoluteSourcePath = await assertEditableCompositionSource({
    context: input.context,
    filePath: sourceFilePath,
  })
  const modelBefore = buildHyperframesStaticTimelineModel({
    context: input.context,
    composition: input.composition,
  })
  const targetClip = findClipTarget(modelBefore.clips, input.clip)
  if (!targetClip) {
    throw new HyperframesError(
      "The timeline clip is no longer available in this composition.",
      "TIMELINE_CLIP_NOT_FOUND",
    )
  }
  if (!targetClip.domId && !targetClip.selector) {
    throw new HyperframesError(
      "This clip does not have a stable source target.",
      "TIMELINE_CLIP_TARGET_UNSTABLE",
    )
  }

  const update = normalizeUpdate({
    start: input.start,
    duration: input.duration,
    track: input.track,
    compositionDuration: modelBefore.durationSeconds,
    playbackStart: input.playbackStart,
  })
  assertClipCanAcceptUpdate({
    clip: targetClip,
    ...update,
  })

  const source = await readFile(absoluteSourcePath, "utf-8")
  const patchedClipSource = patchClipOpeningTag({
    source,
    clip: targetClip,
    ...update,
  })
  const nextSource = patchClipZIndexes({
    source: patchedClipSource,
    clips: modelBefore.clips,
    targetClip,
    targetTrack: update.track,
  })

  await writeFile(absoluteSourcePath, nextSource, "utf-8")

  return {
    compositionId: input.composition.id,
    clipId: targetClip.id,
    model: buildHyperframesStaticTimelineModel({
      context: input.context,
      composition: input.composition,
    }),
  }
}
