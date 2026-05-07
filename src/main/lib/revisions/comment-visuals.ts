import { eq } from "drizzle-orm"
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
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
import { runHyperframesCommand } from "../hyperframes/runtime"
import type { HyperframesCommandResult } from "../hyperframes/types"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import {
  captureFramesWithFastBrowser,
  FrameSheetCliError,
  runFrameSheetCommand,
} from "../../../cli/frame-sheet"
import { resolveRevisionProjectPath } from "./revision-acceptance"

type Db = {
  select: (...args: any[]) => any
}

interface SnapshotFileInfo {
  mtimeMs: number
  size: number
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
const FRAME_CAPTURE_HYPERFRAMES_TIMEOUT_MS = 15_000
const FRAME_CAPTURE_PROCESS_TIMEOUT_MS = 30_000
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

async function readProjectEntryFile(projectPath: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(join(projectPath, "hyperframes.json"), "utf8"))
    if (typeof parsed?.entry === "string" && parsed.entry.trim()) {
      return normalizeRelativeProjectPath(parsed.entry)
    }
  } catch {
    // Fall through to the HyperFrames default entry.
  }
  return "index.html"
}

export async function canCaptureCompositionWithHyperframesSnapshot(input: {
  projectPath: string
  composition?: Composition | null
}): Promise<boolean> {
  if (!input.composition) return true
  const entry = await readProjectEntryFile(input.projectPath)
  const compositionFile = normalizeRelativeProjectPath(input.composition.filePath)
  return compositionFile === entry
}

async function listSnapshotFiles(snapshotDir: string): Promise<Map<string, SnapshotFileInfo>> {
  try {
    const entries = await readdir(snapshotDir)
    const files = new Map<string, SnapshotFileInfo>()
    for (const entry of entries.filter((item) => /\.(png|jpg|jpeg|webp)$/i.test(item))) {
      const fileStat = await stat(join(snapshotDir, entry))
      if (!fileStat.isFile()) continue
      files.set(entry, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
      })
    }
    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map()
    throw error
  }
}

function changedSnapshotFiles(
  before: Map<string, SnapshotFileInfo>,
  after: Map<string, SnapshotFileInfo>,
): string[] {
  return Array.from(after.entries())
    .filter(([fileName, info]) => {
      const previous = before.get(fileName)
      return !previous || previous.mtimeMs !== info.mtimeMs || previous.size !== info.size
    })
    .map(([fileName]) => fileName)
    .sort()
}

function shouldFallbackToHyperframesFrameCapture(error: unknown): boolean {
  return error instanceof FrameSheetCliError &&
    (error.code === "FAST_BROWSER_MISSING" || error.code === "FAST_CAPTURE_FAILED")
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
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  return withSourceCaptureMutex(input.sourcePath, async () => {
    try {
      return await captureSingleFrameFast(input)
    } catch (error) {
      if (!shouldFallbackToHyperframesFrameCapture(error)) throw error
    }

    const snapshotDir = join(input.sourcePath, "snapshots")
    const before = await listSnapshotFiles(snapshotDir)
    const atSeconds = (input.timeMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
    const command = await runHyperframesCommand([
      "snapshot",
      "--at",
      atSeconds,
      "--timeout",
      String(FRAME_CAPTURE_HYPERFRAMES_TIMEOUT_MS),
      input.sourcePath,
    ], {
      cwd: input.sourcePath,
      repoRoot: input.repoRoot,
      timeout: FRAME_CAPTURE_PROCESS_TIMEOUT_MS,
    })
    if (!command.ok) {
      throw new Error("HyperFrames could not capture the current frame.")
    }

    const after = await listSnapshotFiles(snapshotDir)
    const changed = changedSnapshotFiles(before, after)
    if (changed.length !== 1) {
      throw new Error(`HyperFrames captured ${changed.length} frames for a frame comment.`)
    }

    const sourceFrame = join(snapshotDir, changed[0])
    const [sourcePathReal, sourceFrameRealPath] = await Promise.all([
      realpath(input.sourcePath),
      realpath(sourceFrame),
    ])
    if (!isPathInsideDirectory(sourcePathReal, sourceFrameRealPath)) {
      throw new Error("HyperFrames produced a frame outside the source project.")
    }

    const visualDir = await prepareCanonicalVisualDir({
      projectPath: input.projectPath,
      threadId: input.threadId,
    })
    const destination = join(visualDir, "frame.png")
    await copyFile(sourceFrame, destination)
    const copied = await stat(destination)
    if (!copied.isFile() || copied.size <= 0) {
      throw new Error("HyperFrames produced an empty frame.")
    }
    if (!before.has(changed[0])) {
      await rm(sourceFrame, { force: true }).catch(() => undefined)
    }

    return {
      kind: "frame",
      relativePath: projectRelative(input.projectPath, destination),
    }
  })
}

async function captureSingleFrameFast(input: {
  projectPath: string
  sourcePath: string
  threadId: string
  timeMs: number
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  const capture = await captureFramesWithFastBrowser({
    projectDir: input.sourcePath,
    timestampsMs: [input.timeMs],
    timeoutMs: FAST_FRAME_CAPTURE_TIMEOUT_MS,
    columns: 1,
    maxSheetWidth: FAST_FRAME_CAPTURE_MAX_WIDTH,
    settleMs: 0,
    env: process.env,
    repoRoot: input.repoRoot,
  })

  try {
    if (capture.framePaths.length !== 1) {
      throw new Error(`Ripple captured ${capture.framePaths.length} frames for a frame comment.`)
    }

    const sourceFrame = capture.framePaths[0]
    const [sourcePathReal, sourceFrameRealPath] = await Promise.all([
      realpath(input.sourcePath),
      realpath(sourceFrame),
    ])
    if (!isPathInsideDirectory(sourcePathReal, sourceFrameRealPath)) {
      throw new Error("Ripple produced a frame outside the source project.")
    }

    const visualDir = await prepareCanonicalVisualDir({
      projectPath: input.projectPath,
      threadId: input.threadId,
    })
    const destination = join(visualDir, "frame.png")
    await copyFile(sourceFrame, destination)
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
      (capture.cleanupPaths ?? []).map((path) =>
        rm(path, { recursive: true, force: true }).catch(() => undefined),
      ),
    )
  }
}

async function captureRangeSheet(input: {
  projectPath: string
  sourcePath: string
  threadId: string
  startTimeMs: number
  endTimeMs: number
  repoRoot?: string
}): Promise<CommentVisualCaptureResult> {
  return withSourceCaptureMutex(input.sourcePath, async () => {
    const result = await runFrameSheetCommand([
      "--dir",
      input.sourcePath,
      "--range",
      `${input.startTimeMs}ms..${input.endTimeMs}ms`,
      "--samples",
      "6",
      "--columns",
      "3",
      "--json",
    ], {
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
  if (!(await canCaptureCompositionWithHyperframesSnapshot({
    projectPath: source.canonicalProjectPath,
    composition: input.composition,
  }))) {
    return null
  }

  const anchor = normalizeCommentAnchor(input.anchor)
  if (anchor.anchorType === "range" && anchor.endTimeMs !== null && anchor.endTimeMs > anchor.startTimeMs) {
    return captureRangeSheet({
      projectPath: source.canonicalProjectPath,
      sourcePath: source.sourcePath,
      threadId: input.threadId,
      startTimeMs: anchor.startTimeMs,
      endTimeMs: anchor.endTimeMs,
      repoRoot: input.repoRoot,
    })
  }

  return captureSingleFrame({
    projectPath: source.canonicalProjectPath,
    sourcePath: source.sourcePath,
    threadId: input.threadId,
    timeMs: anchor.startTimeMs,
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
