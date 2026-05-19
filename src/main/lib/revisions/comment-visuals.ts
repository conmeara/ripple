import { eq } from "drizzle-orm"
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import {
  type RippleCommentAnchorInput,
  normalizeCommentAnchor,
} from "../../../shared/ripple-comments"
import type { AgentRuntimeAttachment } from "../../../shared/agent-runtime-attachments"
import {
  commentThreads,
  revisions,
  type CommentThread,
  type Composition,
  type Project,
} from "../db/schema"
import { createVisualContextService } from "../visual-context"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { runVisualCommand } from "../../../cli/visual"
import { resolveRevisionProjectPath } from "./revision-acceptance"

type Db = {
  select: (...args: any[]) => any
}

export interface CommentVisualCaptureResult {
  relativePath: string
  kind: "frame" | "range_sheet"
}

export interface CommentVisualAttachmentResolution {
  attachments: AgentRuntimeAttachment[]
  promptContext: string | null
}

const sourceCaptureLocks = new Map<string, Promise<void>>()
const FAST_FRAME_CAPTURE_TIMEOUT_MS = 5_000
const FAST_FRAME_CAPTURE_MAX_WIDTH = 1920

function normalizeRelativeProjectPath(filePath: string): string {
  const normalized = normalize(filePath).replace(/\\/g, "/")
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    isAbsolute(normalized) ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Comment visual path is outside the project.")
  }
  return normalized
}

function assertPathInside(root: string, candidate: string): void {
  const relativePath = relative(root, candidate)
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    relativePath === ".." ||
    relativePath.split(sep).includes("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Comment visual path is outside the project.")
  }
}

function projectRelative(projectPath: string, path: string): string {
  return relative(projectPath, path).replace(/\\/g, "/")
}

async function withSourceCaptureMutex<T>(
  sourcePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const sourceRealPath = await realpath(sourcePath)
  const previous = sourceCaptureLocks.get(sourceRealPath) ?? Promise.resolve()
  let release: () => void = () => undefined
  const current = previous.then(() => new Promise<void>((resolve) => {
    release = resolve
  }))
  sourceCaptureLocks.set(sourceRealPath, current)
  await previous

  try {
    return await fn()
  } finally {
    release()
    if (sourceCaptureLocks.get(sourceRealPath) === current) {
      sourceCaptureLocks.delete(sourceRealPath)
    }
  }
}

async function resolveVisualSource(input: {
  db: Db
  project: Project
  sourceRevisionId?: string | null
}): Promise<{ canonicalProjectPath: string; sourcePath: string }> {
  const canonicalProjectPath = resolveRevisionProjectPath(input.project)
  if (!input.sourceRevisionId) {
    return { canonicalProjectPath, sourcePath: canonicalProjectPath }
  }

  const revision = input.db
    .select()
    .from(revisions)
    .where(eq(revisions.id, input.sourceRevisionId))
    .get()
  if (
    !revision ||
    revision.projectId !== input.project.id ||
    !revision.contextPath ||
    revision.status === "failed" ||
    revision.status === "rejected"
  ) {
    return { canonicalProjectPath, sourcePath: canonicalProjectPath }
  }

  return {
    canonicalProjectPath,
    sourcePath: resolve(revision.contextPath),
  }
}

export async function prepareCanonicalVisualDir(input: {
  projectPath: string
  threadId: string
}): Promise<string> {
  const rippleDir = resolve(input.projectPath, ".ripple")
  const root = resolve(input.projectPath, ".ripple", "comment-visuals")
  const visualDir = resolve(root, input.threadId)
  assertPathInside(input.projectPath, rippleDir)
  assertPathInside(input.projectPath, root)
  assertPathInside(input.projectPath, visualDir)

  await assertExistingVisualSymlinkInsideProject(input.projectPath, rippleDir)
  await assertExistingVisualSymlinkInsideProject(input.projectPath, root)
  await assertExistingVisualSymlinkInsideProject(input.projectPath, visualDir)
  await mkdir(visualDir, { recursive: true })

  const [projectRealPath, visualDirRealPath] = await Promise.all([
    realpath(input.projectPath),
    realpath(visualDir),
  ])
  if (!isPathInsideDirectory(projectRealPath, visualDirRealPath)) {
    throw new Error("Comment visual storage is outside the project.")
  }
  return visualDir
}

async function assertExistingVisualSymlinkInsideProject(
  projectPath: string,
  candidatePath: string,
): Promise<void> {
  try {
    const info = await lstat(candidatePath)
    if (!info.isSymbolicLink()) return
    const resolved = await realpath(candidatePath)
    if (!isPathInsideDirectory(projectPath, resolved)) {
      throw new Error("Comment visual storage is outside the project.")
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

async function captureSingleFrame(input: {
  projectPath: string
  sourcePath: string
  threadId: string
  timeMs: number
  compositionPath?: string | null
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  return withSourceCaptureMutex(input.sourcePath, () => captureSingleFrameWithService(input))
}

async function captureSingleFrameWithService(input: {
  projectPath: string
  sourcePath: string
  threadId: string
  timeMs: number
  compositionPath?: string | null
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  const visualDir = await prepareCanonicalVisualDir({
    projectPath: input.projectPath,
    threadId: input.threadId,
  })
  const service = createVisualContextService()
  let cleanupPaths: string[] = []

  try {
    const capture = await service.captureFrames({
      projectPath: input.projectPath,
      sourcePath: input.sourcePath,
      compositionPath: input.compositionPath,
      timestampsMs: [input.timeMs],
      fps: 30,
      width: FAST_FRAME_CAPTURE_MAX_WIDTH,
      height: 1080,
      format: "png",
      timeoutMs: FAST_FRAME_CAPTURE_TIMEOUT_MS,
      reason: "comment-frame",
      intent: "specific-frame",
      outputDir: visualDir,
      env: process.env,
      repoRoot: input.repoRoot,
    })
    cleanupPaths = capture.cleanupPaths
    if (capture.frames.length !== 1) {
      throw new Error(`Ripple captured ${capture.frames.length} frames for a frame comment.`)
    }

    const sourceFrame = capture.frames[0].path
    const [sourcePathReal, sourceFrameRealPath] = await Promise.all([
      realpath(visualDir),
      realpath(sourceFrame),
    ])
    if (!isPathInsideDirectory(sourcePathReal, sourceFrameRealPath)) {
      throw new Error("Ripple produced a frame outside the comment visual directory.")
    }

    const destination = join(visualDir, "frame.png")
    if (sourceFrameRealPath !== await realpath(destination).catch(() => null)) {
      await copyFile(sourceFrame, destination)
      await rm(sourceFrame, { force: true }).catch(() => undefined)
    }
    const copied = await stat(destination)
    if (!copied.isFile() || copied.size <= 0) {
      throw new Error("Ripple produced an empty frame.")
    }

    return {
      kind: "frame",
      relativePath: projectRelative(input.projectPath, destination),
    }
  } finally {
    await Promise.all(
      cleanupPaths.map((path) =>
        rm(path, { recursive: true, force: true }).catch(() => undefined),
      ),
    )
    await service.shutdown()
  }
}

async function captureRangeSheet(input: {
  projectPath: string
  sourcePath: string
  threadId: string
  startTimeMs: number
  endTimeMs: number
  compositionPath?: string | null
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  return withSourceCaptureMutex(input.sourcePath, async () => {
    const args = [
      "sheet",
      "--dir",
      input.sourcePath,
      "--range",
      `${input.startTimeMs}ms..${input.endTimeMs}ms`,
      "--samples",
      "6",
      "--columns",
      "3",
      "--backend",
      "engine",
      "--json",
    ]
    if (input.compositionPath) {
      args.push("--composition", input.compositionPath)
    }

    const result = await runVisualCommand(args, {
      cwd: input.sourcePath,
      env: process.env,
      repoRoot: input.repoRoot,
    })
    if (result.exitCode !== 0) {
      throw new Error("Ripple could not generate a frame sheet for this range.")
    }

    const payload = JSON.parse(result.stdout) as {
      ok?: boolean
      sheet?: { path?: string }
    }
    if (!payload.ok || !payload.sheet?.path) {
      throw new Error("Ripple did not return a frame-sheet path.")
    }

    const sourceSheetPath = resolve(input.sourcePath, normalizeRelativeProjectPath(payload.sheet.path))
    const sourceBundleDir = dirname(sourceSheetPath)
    const [sourcePathReal, sourceBundleRealPath] = await Promise.all([
      realpath(input.sourcePath),
      realpath(sourceBundleDir),
    ])
    if (!isPathInsideDirectory(sourcePathReal, sourceBundleRealPath)) {
      throw new Error("Frame-sheet output is outside the source project.")
    }

    const visualDir = await prepareCanonicalVisualDir({
      projectPath: input.projectPath,
      threadId: input.threadId,
    })
    await cp(sourceBundleDir, visualDir, { recursive: true, force: true })
    const copiedSheet = join(visualDir, "sheet.png")
    const copied = await stat(copiedSheet)
    if (!copied.isFile() || copied.size <= 0) {
      throw new Error("Ripple produced an empty frame sheet.")
    }

    return {
      kind: "range_sheet",
      relativePath: projectRelative(input.projectPath, copiedSheet),
    }
  })
}

export async function captureCommentVisualForAnchor(input: {
  db: Db
  project: Project
  composition?: Composition | null
  anchor: RippleCommentAnchorInput
  threadId: string
  sourceRevisionId?: string | null
  repoRoot?: string
}): Promise<CommentVisualCaptureResult | null> {
  const source = await resolveVisualSource({
    db: input.db,
    project: input.project,
    sourceRevisionId: input.sourceRevisionId,
  })

  const anchor = normalizeCommentAnchor(input.anchor)
  const compositionPath = input.composition?.filePath ?? null
  if (anchor.anchorType === "range" && anchor.endTimeMs !== null && anchor.endTimeMs > anchor.startTimeMs) {
    return captureRangeSheet({
      projectPath: source.canonicalProjectPath,
      sourcePath: source.sourcePath,
      threadId: input.threadId,
      startTimeMs: anchor.startTimeMs,
      endTimeMs: anchor.endTimeMs,
      compositionPath,
      repoRoot: input.repoRoot,
    })
  }

  return captureSingleFrame({
    projectPath: source.canonicalProjectPath,
    sourcePath: source.sourcePath,
    threadId: input.threadId,
    timeMs: anchor.startTimeMs,
    compositionPath,
    repoRoot: input.repoRoot,
  })
}

function mediaTypeForPath(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".gif") return "image/gif"
  return "image/png"
}

function timecodeMs(timeMs: number): string {
  const totalFrames = Math.max(0, Math.round((timeMs / 1000) * 30))
  const frames = totalFrames % 30
  const totalSeconds = Math.floor(totalFrames / 30)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `00:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`
}

async function readFrameSheetSummary(visualPath: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(join(dirname(visualPath), "manifest.json"), "utf8"))
    if (!Array.isArray(manifest?.samples)) return null
    const lines = manifest.samples
      .slice(0, 12)
      .map((sample: any) => {
        const index = Number(sample?.index ?? 0)
        const timeMs = Number(sample?.timeMs ?? 0)
        const frame = Number(sample?.frame ?? 0)
        return `- Cell ${index + 1}: ${timecodeMs(timeMs)} / frame ${frame}`
      })
    return [
      "Attached frame sheet for this range comment:",
      ...lines,
    ].join("\n")
  } catch {
    return null
  }
}

function framePrompt(thread: CommentThread, visualRelativePath: string): string {
  if (basename(visualRelativePath) === "sheet.png") {
    return `Visual context: attached frame sheet from ${visualRelativePath}.`
  }
  return `Visual context: attached current-frame screenshot from ${visualRelativePath} at ${timecodeMs(thread.startTime)} / frame ${thread.startFrame}.`
}

export async function resolveCommentVisualAttachmentsForRun(input: {
  db: Db
  run: { threadId?: string | null }
  projectPath: string
}): Promise<CommentVisualAttachmentResolution> {
  const threadId = input.run.threadId ?? null
  if (!threadId) {
    return { attachments: [], promptContext: null }
  }

  const thread = input.db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .get()
  if (!thread?.screenshotPath) {
    return { attachments: [], promptContext: null }
  }

  const relativePath = normalizeRelativeProjectPath(thread.screenshotPath)
  const visualPath = resolve(input.projectPath, relativePath)
  assertPathInside(input.projectPath, visualPath)
  const [projectRealPath, visualRealPath] = await Promise.all([
    realpath(input.projectPath),
    realpath(visualPath),
  ])
  if (!isPathInsideDirectory(projectRealPath, visualRealPath)) {
    throw new Error("Comment visual is outside the project.")
  }

  const image = await readFile(visualRealPath)
  const promptParts = [framePrompt(thread, relativePath)]
  const sheetSummary = basename(visualPath) === "sheet.png"
    ? await readFrameSheetSummary(visualPath)
    : null
  if (sheetSummary) promptParts.push(sheetSummary)

  return {
    attachments: [{
      type: "image",
      base64Data: image.toString("base64"),
      mediaType: mediaTypeForPath(visualPath),
      filename: basename(visualPath),
      size: image.byteLength,
    }],
    promptContext: promptParts.join("\n\n"),
  }
}
