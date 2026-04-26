import { existsSync, readFileSync, statSync } from "node:fs"
import { basename, extname, posix } from "node:path"
import { parseHTML } from "linkedom/worker"
import type { Composition } from "../db/schema"
import {
  RIPPLE_TIMELINE_FPS,
  type RippleTimelineClip,
  type RippleTimelineClipKind,
  type RippleTimelineModel,
  filterTimelineDisplayClips,
  getTimelineDurationFromClips,
  labelFromTimelineIdentifier,
  normalizeRippleTimelineDuration,
  roundTimelineSecond,
  sortTimelineClips,
  timelineSecondsToFrame,
} from "../../../shared/hyperframes-timeline-model"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "./project-context"
import { upgradeLegacyRippleStarterHtmlForPreview } from "./player-source"
import type { HyperframesProjectContext } from "./types"
import { HyperframesError } from "./types"

type QueryRoot = Pick<ParentNode, "querySelector" | "querySelectorAll">

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "getAttribute" in value
}

function parseNumberAttribute(element: Element | null, attribute: string): number | null {
  if (!element) return null
  const value = element.getAttribute(attribute)
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstUsefulClass(element: Element): string | null {
  const className = element.getAttribute("class")
  if (!className) return null

  return className
    .split(/\s+/)
    .map((part) => part.trim())
    .find((part) => part && part !== "clip") ?? null
}

function safeTextLabel(element: Element): string | null {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > 36 ? `${text.slice(0, 33)}...` : text
}

function selectorForElement(element: Element): string | undefined {
  const id = element.getAttribute("id")
  if (id) return `#${id}`

  const compositionId = element.getAttribute("data-composition-id")
  if (compositionId) return `[data-composition-id="${compositionId}"]`

  const className = firstUsefulClass(element)
  return className ? `.${className}` : undefined
}

function selectorIndex(root: QueryRoot, element: Element, selector?: string): number | undefined {
  if (!selector || selector.startsWith("#") || selector.startsWith("[data-composition-id=")) {
    return undefined
  }

  try {
    const matches = Array.from(root.querySelectorAll(selector))
    const index = matches.indexOf(element)
    return index >= 0 ? index : undefined
  } catch {
    return undefined
  }
}

function isExternalReference(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|data:|blob:|#|\/)/i.test(value)
}

function normalizeRelativeReference(value: string | null, filePath: string): string | null {
  if (!value?.trim()) return null
  if (isExternalReference(value)) return value

  const directory = posix.dirname(filePath)
  const candidate = directory === "." ? value : posix.join(directory, value)
  try {
    return normalizeProjectRelativePath(candidate)
  } catch {
    return value
  }
}

function resolveMediaAssetUrl(element: Element, filePath: string): string | null {
  const direct = element.getAttribute("src")
  if (direct) return normalizeRelativeReference(direct, filePath)

  const media = element.querySelector("video[src], audio[src], img[src], source[src]")
  if (!media) return null

  return normalizeRelativeReference(media.getAttribute("src"), filePath)
}

function clipKindForElement(element: Element, rootCompositionId: string | null): RippleTimelineClipKind {
  const tagName = element.tagName.toLowerCase()
  const compositionId = element.getAttribute("data-composition-id")
  const compositionSrc =
    element.getAttribute("data-composition-src") ??
    element.getAttribute("data-composition-file")

  if (compositionSrc || (compositionId && compositionId !== rootCompositionId)) {
    return "composition"
  }
  if (tagName === "video") return "video"
  if (tagName === "audio") return "audio"
  if (tagName === "img") return "image"
  if (element.querySelector("video")) return "video"
  if (element.querySelector("audio")) return "audio"
  if (element.querySelector("img")) return "image"

  return "element"
}

function labelForElement(element: Element, id: string, assetUrl: string | null): string {
  const explicit =
    element.getAttribute("data-label") ??
    element.getAttribute("aria-label") ??
    element.getAttribute("title")
  if (explicit?.trim()) return explicit.trim()

  const compositionId = element.getAttribute("data-composition-id")
  if (compositionId?.trim()) return labelFromTimelineIdentifier(compositionId)

  const className = firstUsefulClass(element)
  if (className) return labelFromTimelineIdentifier(className)

  if (assetUrl) return labelFromTimelineIdentifier(basename(assetUrl, extname(assetUrl)))

  return safeTextLabel(element) ?? labelFromTimelineIdentifier(id)
}

function buildStaticClip(input: {
  root: QueryRoot
  rootCompositionId: string | null
  element: Element
  filePath: string
  fallbackIndex: number
  rootDuration: number | null
}): RippleTimelineClip | null {
  const start = roundTimelineSecond(parseNumberAttribute(input.element, "data-start") ?? 0)
  const declaredDuration = parseNumberAttribute(input.element, "data-duration")
  const duration = normalizeRippleTimelineDuration(
    declaredDuration ?? (
      input.rootDuration !== null ? Math.max(0, input.rootDuration - start) : null
    ),
  )
  if (duration === null) return null
  if (input.rootDuration !== null && start >= input.rootDuration) return null

  const clippedDuration = input.rootDuration !== null
    ? Math.min(duration, Math.max(0, input.rootDuration - start))
    : duration
  if (clippedDuration <= 0) return null

  const tagName = input.element.tagName.toLowerCase()
  const domId = input.element.getAttribute("id") ?? undefined
  const compositionId = input.element.getAttribute("data-composition-id")
  const compositionSrc = normalizeRelativeReference(
    input.element.getAttribute("data-composition-src") ??
      input.element.getAttribute("data-composition-file"),
    input.filePath,
  )
  const assetUrl = resolveMediaAssetUrl(input.element, input.filePath)
  const selector = selectorForElement(input.element)
  const index = selectorIndex(input.root, input.element, selector)
  const id =
    domId ??
    compositionId ??
    firstUsefulClass(input.element) ??
    `${tagName}-${input.fallbackIndex + 1}`

  return {
    id,
    key: `${input.filePath}:${selector ?? id}:${index ?? input.fallbackIndex}`,
    label: labelForElement(input.element, id, assetUrl),
    kind: clipKindForElement(input.element, input.rootCompositionId),
    tagName,
    start,
    duration: roundTimelineSecond(clippedDuration),
    track: Math.max(
      0,
      Math.round(parseNumberAttribute(input.element, "data-track-index") ?? input.fallbackIndex),
    ),
    sourceFile: input.filePath,
    selector,
    selectorIndex: index,
    domId,
    compositionId: compositionId ?? null,
    parentCompositionId: input.rootCompositionId,
    compositionSrc,
    assetUrl,
    playbackStart:
      parseNumberAttribute(input.element, "data-playback-start") ??
      parseNumberAttribute(input.element, "data-media-start") ??
      undefined,
    sourceDuration: parseNumberAttribute(input.element, "data-source-duration") ?? undefined,
    volume: parseNumberAttribute(input.element, "data-volume") ?? undefined,
    editable: false,
    confidence: "static",
  }
}

function parseTimelineMetadata(projectPath: string): { fps: number; duration: number | null } {
  const metadataPath = `${projectPath}/hyperframes.json`
  if (!existsSync(metadataPath)) {
    return { fps: RIPPLE_TIMELINE_FPS, duration: null }
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf-8")) as {
      fps?: unknown
      duration?: unknown
    }
    const fps =
      typeof parsed.fps === "number" && Number.isFinite(parsed.fps) && parsed.fps > 0
        ? Math.round(parsed.fps)
        : RIPPLE_TIMELINE_FPS

    return {
      fps,
      duration: normalizeRippleTimelineDuration(parsed.duration),
    }
  } catch {
    return { fps: RIPPLE_TIMELINE_FPS, duration: null }
  }
}

function getQueryRoot(html: string): QueryRoot {
  const { document } = parseHTML(html)
  const template = document.querySelector("template")
  return template?.content ?? document
}

function buildFallbackRootClip(input: {
  composition: Composition
  rootComposition: Element | null
  filePath: string
  duration: number
}): RippleTimelineClip {
  const compositionId =
    input.rootComposition?.getAttribute("data-composition-id") ??
    input.composition.dataCompositionId
  const selector = input.rootComposition
    ? selectorForElement(input.rootComposition)
    : `[data-composition-id="${compositionId}"]`

  return {
    id: compositionId,
    key: `${input.filePath}:${selector ?? compositionId}:root`,
    label: input.composition.name,
    kind: "composition",
    tagName: input.rootComposition?.tagName.toLowerCase() ?? null,
    start: 0,
    duration: input.duration,
    track: 0,
    sourceFile: input.filePath,
    selector,
    compositionId,
    parentCompositionId: null,
    compositionSrc: input.filePath,
    assetUrl: null,
    editable: false,
    confidence: "fallback",
  }
}

export function buildHyperframesStaticTimelineModel(input: {
  context: HyperframesProjectContext
  composition: Composition
}): RippleTimelineModel {
  const filePath = normalizeProjectRelativePath(input.composition.filePath)
  const absolutePath = resolveProjectRelativePath(input.context, filePath)

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new HyperframesError(
      "This composition file is missing from the project.",
      "COMPOSITION_FILE_MISSING",
    )
  }

  const rawHtml = upgradeLegacyRippleStarterHtmlForPreview(
    readFileSync(absolutePath, "utf-8"),
  )
  const root = getQueryRoot(rawHtml)
  const rootComposition = root.querySelector("[data-composition-id]")
  const rootCompositionId = rootComposition?.getAttribute("data-composition-id") ?? null
  const metadata = parseTimelineMetadata(input.context.projectPath)
  const declaredRootDuration =
    normalizeRippleTimelineDuration(parseNumberAttribute(rootComposition, "data-duration")) ??
    metadata.duration
  const clipNodes = Array.from(root.querySelectorAll("[data-start]"))
    .filter((node): node is Element => isElement(node))
    .filter((element) => element !== rootComposition)
  const clips = sortTimelineClips(
    clipNodes.flatMap((element, index) => {
      const clip = buildStaticClip({
        root,
        rootCompositionId,
        element,
        filePath,
        fallbackIndex: index,
        rootDuration: declaredRootDuration,
      })
      return clip ? [clip] : []
    }),
  )
  const durationSeconds =
    declaredRootDuration ??
    getTimelineDurationFromClips(clips) ??
    normalizeRippleTimelineDuration(input.composition.kind === "root" ? metadata.duration : null)
  const fallbackClips = clips.length === 0 && durationSeconds !== null
    ? [buildFallbackRootClip({
        composition: input.composition,
        rootComposition,
        filePath,
        duration: durationSeconds,
      })]
    : filterTimelineDisplayClips(clips)
  const durationFrames = durationSeconds !== null
    ? timelineSecondsToFrame(durationSeconds, metadata.fps)
    : null

  return {
    projectId: input.context.projectId,
    compositionId: input.composition.id,
    filePath,
    source: "static-source",
    fps: metadata.fps,
    durationSeconds,
    durationFrames,
    width: parseNumberAttribute(rootComposition, "data-width") ?? input.composition.width,
    height: parseNumberAttribute(rootComposition, "data-height") ?? input.composition.height,
    clips: fallbackClips,
    scenes: durationSeconds !== null
      ? [{
          id: input.composition.dataCompositionId,
          label: input.composition.name,
          start: 0,
          duration: durationSeconds,
          thumbnailUrl: null,
        }]
      : [],
  }
}
