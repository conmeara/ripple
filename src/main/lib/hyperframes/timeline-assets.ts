import { lstat, readFile, realpath, writeFile } from "node:fs/promises"
import { parseHTML } from "linkedom/worker"
import type { Composition } from "../db/schema"
import {
  buildTrackZIndexMap,
  buildTimelineAssetId,
  buildTimelineAssetInsertHtml,
  getTimelineAssetKind,
  insertTimelineAssetIntoSource,
  resolveTimelineAssetSrc,
} from "../../../shared/hyperframes-timeline-editing"
import {
  normalizeRippleTimelineDuration,
  roundTimelineSecond,
} from "../../../shared/hyperframes-timeline-model"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "./project-context"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { buildHyperframesStaticTimelineModel } from "./timeline-model"
import type { HyperframesProjectContext } from "./types"
import { HyperframesError } from "./types"

const DEFAULT_DROPPED_ASSET_DURATION_SECONDS = 5

function resolveDroppedAssetDuration(input: {
  requestedDuration?: number | null
  compositionDuration: number | null
  start: number
}): number {
  const requested = normalizeRippleTimelineDuration(input.requestedDuration)
  const desired = requested ?? DEFAULT_DROPPED_ASSET_DURATION_SECONDS
  if (input.compositionDuration === null) return desired

  const remaining = Math.max(0, input.compositionDuration - input.start)
  return Math.max(0.05, Math.min(desired, remaining || desired))
}

function resolveDroppedAssetStart(input: {
  requestedStart: number
  compositionDuration: number | null
}): number {
  const start = roundTimelineSecond(Math.max(0, input.requestedStart))
  if (input.compositionDuration === null) return start
  return Math.min(start, Math.max(0, input.compositionDuration - 0.05))
}

async function assertUsableProjectAsset(input: {
  context: HyperframesProjectContext
  assetPath: string
}): Promise<void> {
  if (!input.assetPath.startsWith("assets/")) {
    throw new HyperframesError(
      "Only project media from the assets folder can be placed on the timeline.",
      "TIMELINE_ASSET_OUTSIDE_ASSETS",
    )
  }
  if (!getTimelineAssetKind(input.assetPath)) {
    throw new HyperframesError(
      "Only image, video, and audio assets can be placed on the timeline.",
      "TIMELINE_ASSET_KIND_UNSUPPORTED",
    )
  }

  const absoluteAssetPath = resolveProjectRelativePath(input.context, input.assetPath)
  const stats = await lstat(absoluteAssetPath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new HyperframesError(
      "This timeline asset is not a regular project file.",
      "TIMELINE_ASSET_NOT_FILE",
    )
  }

  const [projectRealPath, assetsRealPath, assetRealPath] = await Promise.all([
    realpath(input.context.projectPath),
    realpath(resolveProjectRelativePath(input.context, "assets")),
    realpath(absoluteAssetPath),
  ])
  if (
    !isPathInsideDirectory(projectRealPath, assetRealPath) ||
    !isPathInsideDirectory(assetsRealPath, assetRealPath)
  ) {
    throw new HyperframesError(
      "This timeline asset resolves outside the project assets folder.",
      "TIMELINE_ASSET_PATH_ESCAPE",
    )
  }
}

function collectSourceElementIds(source: string): string[] {
  const { document } = parseHTML(source)
  return Array.from(document.querySelectorAll("[id]"))
    .map((element) => element.getAttribute("id")?.trim())
    .filter((id): id is string => Boolean(id))
}

export async function insertHyperframesTimelineAsset(input: {
  context: HyperframesProjectContext
  composition: Composition
  assetPath: string
  start: number
  track: number
  duration?: number | null
}) {
  const assetPath = normalizeProjectRelativePath(input.assetPath)
  await assertUsableProjectAsset({
    context: input.context,
    assetPath,
  })

  const kind = getTimelineAssetKind(assetPath)
  if (!kind) {
    throw new HyperframesError(
      "Only image, video, and audio assets can be placed on the timeline.",
      "TIMELINE_ASSET_KIND_UNSUPPORTED",
    )
  }

  const modelBefore = buildHyperframesStaticTimelineModel({
    context: input.context,
    composition: input.composition,
  })
  const start = resolveDroppedAssetStart({
    requestedStart: input.start,
    compositionDuration: modelBefore.durationSeconds,
  })
  const duration = resolveDroppedAssetDuration({
    requestedDuration: input.duration,
    compositionDuration: modelBefore.durationSeconds,
    start,
  })
  const track = Math.max(0, Math.round(input.track))
  const sourceFilePath = normalizeProjectRelativePath(input.composition.filePath)
  const absoluteSourcePath = resolveProjectRelativePath(input.context, sourceFilePath)
  const source = await readFile(absoluteSourcePath, "utf-8")
  const id = buildTimelineAssetId(
    assetPath,
    [
      ...modelBefore.clips.map((clip) => clip.id),
      ...collectSourceElementIds(source),
    ],
  )
  const assetSrc = resolveTimelineAssetSrc(sourceFilePath, assetPath)
  const zIndexByTrack = buildTrackZIndexMap([
    ...modelBefore.clips.map((clip) => clip.track),
    track,
  ])
  const assetHtml = buildTimelineAssetInsertHtml({
    id,
    assetPath: assetSrc,
    kind,
    start,
    duration,
    track,
    zIndex: zIndexByTrack.get(track) ?? 1,
  })

  let nextSource: string
  try {
    nextSource = insertTimelineAssetIntoSource(source, `\n  ${assetHtml}`)
  } catch (error) {
    throw new HyperframesError(
      error instanceof Error ? error.message : "The asset could not be added to the timeline.",
      "TIMELINE_ASSET_INSERT_FAILED",
    )
  }

  await writeFile(absoluteSourcePath, nextSource, "utf-8")

  const model = buildHyperframesStaticTimelineModel({
    context: input.context,
    composition: input.composition,
  })

  return {
    assetPath,
    compositionId: input.composition.id,
    clipId: id,
    model,
  }
}
