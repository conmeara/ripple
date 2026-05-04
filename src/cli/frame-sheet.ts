import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { isPathInsideDirectory } from "../shared/path-boundary"
import {
  buildHyperframesEnvironment,
  getAppManagedCommandCandidates,
  pathExists,
  resolveProducerBrowserPath,
  resolvePackageJsonPath,
  runHyperframesCommand,
} from "../main/lib/hyperframes/runtime"
import type { HyperframesCommandResult } from "../main/lib/hyperframes/types"

const execFileAsync = promisify(execFile)

const DEFAULT_FPS = 30
const DEFAULT_SAMPLES = 8
const MAX_SAMPLES = 12
const DEFAULT_MAX_SHEET_WIDTH = 1440
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_FAST_CAPTURE_SETTLE_MS = 50
const LOCK_STALE_MS = 2 * 60 * 1000
const LOCK_WAIT_MS = 15 * 1000

type FrameSheetCaptureMode = "fast" | "hyperframes"

export interface FrameSheetSample {
  index: number
  timeMs: number
  frame: number
  path: string
}

export interface FrameSheetManifest {
  version: 1
  id: string
  kind: "frame_sheet"
  projectDir: "."
  rangeMs: [number, number] | null
  fps: number
  columns: number
  rows: number
  sheetPath: string
  samples: FrameSheetSample[]
}

export interface FrameSheetSuccessJson {
  ok: true
  sheet: {
    id: string
    path: string
    manifestPath: string
    sampleCount: number
    summary: string
  }
}

export interface FrameSheetErrorJson {
  ok: false
  error: {
    code: string
    message: string
  }
}

export interface FrameSheetCliResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface FrameSheetCaptureResult {
  framePaths: string[]
  cleanupPaths?: string[]
  command?: HyperframesCommandResult
}

export interface FrameSheetCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  repoRoot?: string
  captureFrames?: (input: {
    projectDir: string
    timestampsMs: number[]
    timeoutMs: number
    columns: number
    rows: number
    maxSheetWidth: number
    settleMs: number
    captureMode: FrameSheetCaptureMode
    env: NodeJS.ProcessEnv
    repoRoot?: string
  }) => Promise<FrameSheetCaptureResult>
  assembleSheet?: (input: {
    framesDir: string
    outputPath: string
    columns: number
    rows: number
    maxSheetWidth: number
    env: NodeJS.ProcessEnv
  }) => Promise<void>
  idFactory?: () => string
  now?: () => number
}

interface ParsedFrameSheetArgs {
  dir: string
  json: boolean
  help: boolean
  at: number[] | null
  range: [number, number] | null
  samples: number | null
  everyMs: number | null
  everyFrames: number | null
  fps: number
  columns: number | null
  timeoutMs: number
  maxSheetWidth: number
  captureMode: FrameSheetCaptureMode
  settleMs: number
}

interface SnapshotFileInfo {
  mtimeMs: number
  size: number
}

export class FrameSheetCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "FrameSheetCliError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function secondsLabel(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}s`
}

function relativeProjectPath(projectDir: string, path: string): string {
  return relative(projectDir, path).replace(/\\/g, "/")
}

function normalizeProjectRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "")
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    isAbsolute(normalized) ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new FrameSheetCliError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
  }
  return normalized
}

function getFlagValue(
  args: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } {
  const arg = args[index]
  const prefix = `${flag}=`
  if (arg.startsWith(prefix)) {
    return { value: arg.slice(prefix.length), nextIndex: index + 1 }
  }
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new FrameSheetCliError("MISSING_OPTION_VALUE", `${flag} requires a value.`)
  }
  return { value, nextIndex: index + 2 }
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FrameSheetCliError("INVALID_NUMBER", `${flag} must be a positive integer.`)
  }
  return parsed
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new FrameSheetCliError("INVALID_NUMBER", `${flag} must be a non-negative integer.`)
  }
  return parsed
}

function parseCaptureMode(value: string): FrameSheetCaptureMode {
  if (value === "fast" || value === "hyperframes") return value
  throw new FrameSheetCliError("INVALID_CAPTURE_MODE", "--capture must be fast or hyperframes.")
}

function parseTimeToMs(value: string, label: string): number {
  const trimmed = value.trim().toLowerCase()
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)?$/.exec(trimmed)
  if (!match) {
    throw new FrameSheetCliError("INVALID_TIME", `${label} must be a timestamp like 1.5s or 1500ms.`)
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) {
    throw new FrameSheetCliError("INVALID_TIME", `${label} must be a non-negative timestamp.`)
  }
  const unit = match[2] ?? "s"
  return Math.round(unit === "ms" ? amount : amount * 1000)
}

function parseAt(value: string): number[] {
  const times = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => parseTimeToMs(part, `--at timestamp ${index + 1}`))

  if (times.length === 0) {
    throw new FrameSheetCliError("EMPTY_SAMPLES", "--at must include at least one timestamp.")
  }
  return times
}

function parseRange(value: string): [number, number] {
  const parts = value.split("..")
  if (parts.length !== 2) {
    throw new FrameSheetCliError("INVALID_RANGE", "--range must look like 2s..8s.")
  }
  const start = parseTimeToMs(parts[0], "--range start")
  const end = parseTimeToMs(parts[1], "--range end")
  if (end < start) {
    throw new FrameSheetCliError("INVALID_RANGE", "--range end must be greater than or equal to the start.")
  }
  return [start, end]
}

function parseArgs(args: string[]): ParsedFrameSheetArgs {
  const parsed: ParsedFrameSheetArgs = {
    dir: ".",
    json: false,
    help: false,
    at: null,
    range: null,
    samples: null,
    everyMs: null,
    everyFrames: null,
    fps: DEFAULT_FPS,
    columns: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxSheetWidth: DEFAULT_MAX_SHEET_WIDTH,
    captureMode: "fast",
    settleMs: DEFAULT_FAST_CAPTURE_SETTLE_MS,
  }

  let index = 0
  while (index < args.length) {
    const arg = args[index]
    if (arg === "--json") {
      parsed.json = true
      index += 1
      continue
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true
      index += 1
      continue
    }
    if (arg === "--dir" || arg.startsWith("--dir=")) {
      const next = getFlagValue(args, index, "--dir")
      parsed.dir = next.value
      index = next.nextIndex
      continue
    }
    if (arg === "--at" || arg.startsWith("--at=")) {
      const next = getFlagValue(args, index, "--at")
      parsed.at = parseAt(next.value)
      index = next.nextIndex
      continue
    }
    if (arg === "--range" || arg.startsWith("--range=")) {
      const next = getFlagValue(args, index, "--range")
      parsed.range = parseRange(next.value)
      index = next.nextIndex
      continue
    }
    if (arg === "--samples" || arg.startsWith("--samples=")) {
      const next = getFlagValue(args, index, "--samples")
      parsed.samples = parsePositiveInteger(next.value, "--samples")
      index = next.nextIndex
      continue
    }
    if (arg === "--every" || arg.startsWith("--every=")) {
      const next = getFlagValue(args, index, "--every")
      parsed.everyMs = parseTimeToMs(next.value, "--every")
      if (parsed.everyMs <= 0) {
        throw new FrameSheetCliError("INVALID_INTERVAL", "--every must be greater than zero.")
      }
      index = next.nextIndex
      continue
    }
    if (arg === "--every-frames" || arg.startsWith("--every-frames=")) {
      const next = getFlagValue(args, index, "--every-frames")
      parsed.everyFrames = parsePositiveInteger(next.value, "--every-frames")
      index = next.nextIndex
      continue
    }
    if (arg === "--fps" || arg.startsWith("--fps=")) {
      const next = getFlagValue(args, index, "--fps")
      parsed.fps = parsePositiveInteger(next.value, "--fps")
      index = next.nextIndex
      continue
    }
    if (arg === "--columns" || arg.startsWith("--columns=")) {
      const next = getFlagValue(args, index, "--columns")
      parsed.columns = parsePositiveInteger(next.value, "--columns")
      index = next.nextIndex
      continue
    }
    if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const next = getFlagValue(args, index, "--timeout")
      parsed.timeoutMs = parsePositiveInteger(next.value, "--timeout")
      index = next.nextIndex
      continue
    }
    if (arg === "--max-sheet-width" || arg.startsWith("--max-sheet-width=")) {
      const next = getFlagValue(args, index, "--max-sheet-width")
      parsed.maxSheetWidth = parsePositiveInteger(next.value, "--max-sheet-width")
      index = next.nextIndex
      continue
    }
    if (arg === "--capture" || arg.startsWith("--capture=")) {
      const next = getFlagValue(args, index, "--capture")
      parsed.captureMode = parseCaptureMode(next.value)
      index = next.nextIndex
      continue
    }
    if (arg === "--settle" || arg.startsWith("--settle=")) {
      const next = getFlagValue(args, index, "--settle")
      parsed.settleMs = parseNonNegativeInteger(next.value, "--settle")
      index = next.nextIndex
      continue
    }
    throw new FrameSheetCliError("UNKNOWN_OPTION", `Unknown frame-sheet option: ${arg}`)
  }

  return parsed
}

function dedupeSorted(times: number[]): number[] {
  return Array.from(new Set(times.map((time) => Math.round(time)))).sort((a, b) => a - b)
}

function validateSampleCount(times: number[]): number[] {
  if (times.length === 0) {
    throw new FrameSheetCliError("EMPTY_SAMPLES", "Frame sheet needs at least one timestamp.")
  }
  if (times.length > MAX_SAMPLES) {
    throw new FrameSheetCliError("TOO_MANY_SAMPLES", `Frame sheets are capped at ${MAX_SAMPLES} samples.`)
  }
  return times
}

export function resolveFrameSheetTimestamps(args: Pick<
  ParsedFrameSheetArgs,
  "at" | "range" | "samples" | "everyMs" | "everyFrames" | "fps"
>): { timestampsMs: number[]; rangeMs: [number, number] | null } {
  if (args.at && args.range) {
    throw new FrameSheetCliError("CONFLICTING_SAMPLES", "Use either --at or --range, not both.")
  }
  if (args.at) {
    return {
      timestampsMs: validateSampleCount(dedupeSorted(args.at)),
      rangeMs: null,
    }
  }

  const range = args.range ?? [0, 8000] as [number, number]
  const [start, end] = range
  if (args.everyMs && args.samples) {
    throw new FrameSheetCliError("CONFLICTING_SAMPLES", "Use either --samples or --every, not both.")
  }
  if (args.everyFrames && (args.samples || args.everyMs)) {
    throw new FrameSheetCliError("CONFLICTING_SAMPLES", "Use --every-frames without --samples or --every.")
  }

  let timestamps: number[]
  if (args.everyFrames) {
    if (!Number.isFinite(args.fps) || args.fps <= 0) {
      throw new FrameSheetCliError("FPS_REQUIRED", "--every-frames requires a valid --fps value.")
    }
    const intervalMs = Math.round((args.everyFrames / args.fps) * 1000)
    if (intervalMs <= 0) {
      throw new FrameSheetCliError("INVALID_INTERVAL", "--every-frames produced an empty interval.")
    }
    timestamps = timestampsForInterval(start, end, intervalMs)
  } else if (args.everyMs) {
    timestamps = timestampsForInterval(start, end, args.everyMs)
  } else {
    const samples = args.samples ?? DEFAULT_SAMPLES
    timestamps = timestampsForSampleCount(start, end, samples)
  }

  return {
    timestampsMs: validateSampleCount(dedupeSorted(timestamps)),
    rangeMs: range,
  }
}

function timestampsForSampleCount(start: number, end: number, samples: number): number[] {
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new FrameSheetCliError("INVALID_NUMBER", "--samples must be a positive integer.")
  }
  if (samples === 1 || start === end) return [start]

  const step = (end - start) / (samples - 1)
  return Array.from({ length: samples }, (_value, index) =>
    Math.round(start + step * index),
  )
}

function timestampsForInterval(start: number, end: number, intervalMs: number): number[] {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new FrameSheetCliError("INVALID_INTERVAL", "Sample interval must be greater than zero.")
  }

  const times: number[] = []
  for (let current = start; current <= end; current += intervalMs) {
    times.push(Math.round(current))
    if (times.length > MAX_SAMPLES + 1) break
  }
  if (times[times.length - 1] !== end) {
    times.push(end)
  }
  return times
}

function getColumns(sampleCount: number, requested: number | null): number {
  if (requested !== null) {
    if (requested < 1 || requested > 4) {
      throw new FrameSheetCliError("INVALID_COLUMNS", "--columns must be between 1 and 4.")
    }
    return Math.min(requested, sampleCount)
  }
  if (sampleCount <= 3) return sampleCount
  return 4
}

async function assertExistingProjectDir(dir: string): Promise<string> {
  try {
    const resolved = await realpath(dir)
    const info = await stat(resolved)
    if (!info.isDirectory()) {
      throw new FrameSheetCliError("PROJECT_DIR_INVALID", "--dir must be a project directory.")
    }
    return resolved
  } catch (error) {
    if (error instanceof FrameSheetCliError) throw error
    throw new FrameSheetCliError("PROJECT_DIR_INVALID", "--dir must be an existing project directory.")
  }
}

async function assertWorkspaceBoundary(input: {
  projectDir: string
  env: NodeJS.ProcessEnv
}): Promise<void> {
  const workspaceRoot = input.env.RIPPLE_AGENT_WORKSPACE_ROOT?.trim()
  if (!workspaceRoot) return
  let workspaceRealPath: string
  try {
    workspaceRealPath = await realpath(workspaceRoot)
  } catch {
    throw new FrameSheetCliError(
      "WORKSPACE_ROOT_MISSING",
      "RIPPLE_AGENT_WORKSPACE_ROOT does not point to an existing workspace.",
    )
  }
  if (!isPathInsideDirectory(workspaceRealPath, input.projectDir)) {
    throw new FrameSheetCliError(
      "WORKSPACE_OUTSIDE_AGENT_ROOT",
      "--dir must be inside RIPPLE_AGENT_WORKSPACE_ROOT.",
    )
  }
}

async function assertExistingSymlinkInsideProject(projectDir: string, targetPath: string): Promise<void> {
  try {
    const linkInfo = await lstat(targetPath)
    if (!linkInfo.isSymbolicLink()) return
    const resolved = await realpath(targetPath)
    if (!isPathInsideDirectory(projectDir, resolved)) {
      throw new FrameSheetCliError(
        "OUTPUT_PATH_ESCAPE",
        "Frame-sheet output path resolves outside the project.",
      )
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

async function prepareFrameSheetRoot(projectDir: string): Promise<string> {
  const rippleDir = resolve(projectDir, ".ripple")
  const root = resolve(rippleDir, "frame-sheets")

  await assertExistingSymlinkInsideProject(projectDir, rippleDir)
  await assertExistingSymlinkInsideProject(projectDir, root)
  await mkdir(root, { recursive: true })

  const rootRealPath = await realpath(root)
  if (!isPathInsideDirectory(projectDir, rootRealPath)) {
    throw new FrameSheetCliError(
      "OUTPUT_PATH_ESCAPE",
      "Frame-sheet output path resolves outside the project.",
    )
  }

  return root
}

async function withCaptureLock<T>(input: {
  frameSheetsRoot: string
  now: () => number
  fn: () => Promise<T>
}): Promise<T> {
  const lockPath = join(input.frameSheetsRoot, ".capture-lock")
  const started = input.now()
  let acquired = false

  while (!acquired) {
    try {
      await mkdir(lockPath)
      acquired = true
      await writeFile(join(lockPath, "owner.json"), JSON.stringify({
        pid: process.pid,
        createdAt: new Date(input.now()).toISOString(),
      }, null, 2))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const info = await stat(lockPath).catch(() => null)
      const age = info ? input.now() - info.mtimeMs : LOCK_STALE_MS + 1
      if (age > LOCK_STALE_MS) {
        await rm(lockPath, { recursive: true, force: true })
        continue
      }
      if (input.now() - started > LOCK_WAIT_MS) {
        throw new FrameSheetCliError(
          "CAPTURE_LOCK_TIMEOUT",
          "Timed out waiting for another visual capture to finish.",
        )
      }
      await delay(100)
    }
  }

  try {
    return await input.fn()
  } finally {
    if (acquired) {
      await rm(lockPath, { recursive: true, force: true })
    }
  }
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

function getChangedSnapshotFiles(
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

async function captureFramesWithHyperframes(input: {
  projectDir: string
  timestampsMs: number[]
  timeoutMs: number
  env: NodeJS.ProcessEnv
  repoRoot?: string
}): Promise<FrameSheetCaptureResult> {
  const snapshotDir = join(input.projectDir, "snapshots")
  const before = await listSnapshotFiles(snapshotDir)
  const atSeconds = input.timestampsMs
    .map((timeMs) => (timeMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""))
    .join(",")
  const command = await runHyperframesCommand([
    "snapshot",
    "--at",
    atSeconds,
    "--timeout",
    String(input.timeoutMs),
    input.projectDir,
  ], {
    cwd: input.projectDir,
    env: input.env,
    repoRoot: input.repoRoot,
    timeout: Math.max(10_000, input.timeoutMs + 5_000),
  })

  if (!command.ok) {
    throw new FrameSheetCliError(
      "SNAPSHOT_FAILED",
      "HyperFrames could not capture the requested frames.",
    )
  }

  const after = await listSnapshotFiles(snapshotDir)
  const changedFiles = getChangedSnapshotFiles(before, after)
  if (changedFiles.length !== input.timestampsMs.length) {
    throw new FrameSheetCliError(
      "SNAPSHOT_SAMPLE_MISMATCH",
      `HyperFrames captured ${changedFiles.length} frame(s), expected ${input.timestampsMs.length}.`,
    )
  }

  const framePaths = changedFiles.map((fileName) => join(snapshotDir, fileName))
  const cleanupPaths = changedFiles
    .filter((fileName) => !before.has(fileName))
    .map((fileName) => join(snapshotDir, fileName))
  return {
    framePaths,
    cleanupPaths,
    command,
  }
}

function contentTypeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith(".html")) return "text/html; charset=utf-8"
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (lower.endsWith(".css")) return "text/css; charset=utf-8"
  if (lower.endsWith(".json")) return "application/json; charset=utf-8"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".mp4")) return "video/mp4"
  if (lower.endsWith(".webm")) return "video/webm"
  if (lower.endsWith(".mp3")) return "audio/mpeg"
  if (lower.endsWith(".wav")) return "audio/wav"
  return "application/octet-stream"
}

export type ProjectServerFileResolution =
  | {
    ok: true
    path: string
    contentType: string
  }
  | {
    ok: false
    status: 403 | 404
  }

function isDeniedProjectServerPath(path: string): boolean {
  const parts = path.split("/")
  if (parts.includes(".git") || parts.includes(".ripple")) return true
  const base = parts[parts.length - 1]?.toLowerCase() ?? ""
  if (base === ".env" || base.startsWith(".env.")) return true
  return base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".crt")
}

export async function resolveProjectServerFile(
  projectDir: string,
  projectRelativePath: string,
): Promise<ProjectServerFileResolution> {
  let relativePath: string
  try {
    relativePath = normalizeProjectRelativePath(projectRelativePath)
  } catch (error) {
    if (error instanceof FrameSheetCliError) return { ok: false, status: 403 }
    throw error
  }
  if (isDeniedProjectServerPath(relativePath)) {
    return { ok: false, status: 403 }
  }

  const projectRealPath = await realpath(projectDir)
  const candidatePath = resolve(projectRealPath, relativePath)
  if (!isPathInsideDirectory(projectRealPath, candidatePath)) {
    return { ok: false, status: 403 }
  }

  let candidateRealPath: string
  try {
    candidateRealPath = await realpath(candidatePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, status: 404 }
    }
    throw error
  }

  if (!isPathInsideDirectory(projectRealPath, candidateRealPath)) {
    return { ok: false, status: 403 }
  }

  const info = await stat(candidateRealPath)
  if (!info.isFile()) {
    return { ok: false, status: 404 }
  }

  return {
    ok: true,
    path: candidateRealPath,
    contentType: contentTypeForPath(candidateRealPath),
  }
}

async function readProjectTextFile(projectDir: string, projectRelativePath: string): Promise<string | null> {
  const resolved = await resolveProjectServerFile(projectDir, projectRelativePath)
  if (!resolved.ok) {
    if (resolved.status === 404) return null
    throw new FrameSheetCliError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
  }
  return readFile(resolved.path, "utf8")
}

async function readProjectMetadata(projectDir: string): Promise<{
  entry: string
  width: number
  height: number
}> {
  let entry = "index.html"
  let width = 1920
  let height = 1080

  try {
    const metadataJson = await readProjectTextFile(projectDir, "hyperframes.json")
    const parsed = metadataJson ? JSON.parse(metadataJson) : null
    if (isRecord(parsed)) {
      if (typeof parsed.entry === "string" && parsed.entry.trim()) {
        entry = normalizeProjectRelativePath(parsed.entry.trim())
      }
      if (typeof parsed.width === "number" && Number.isFinite(parsed.width) && parsed.width > 0) {
        width = Math.round(parsed.width)
      }
      if (typeof parsed.height === "number" && Number.isFinite(parsed.height) && parsed.height > 0) {
        height = Math.round(parsed.height)
      }
    }
  } catch (error) {
    if (error instanceof FrameSheetCliError) throw error
    // Fall back to the HyperFrames defaults.
  }

  try {
    const html = await readProjectTextFile(projectDir, entry)
    if (!html) return { entry, width, height }
    const widthMatch = /\bdata-width=["'](\d+(?:\.\d+)?)["']/.exec(html)
    const heightMatch = /\bdata-height=["'](\d+(?:\.\d+)?)["']/.exec(html)
    const htmlWidth = widthMatch ? Number(widthMatch[1]) : NaN
    const htmlHeight = heightMatch ? Number(heightMatch[1]) : NaN
    if (Number.isFinite(htmlWidth) && htmlWidth > 0) width = Math.round(htmlWidth)
    if (Number.isFinite(htmlHeight) && htmlHeight > 0) height = Math.round(htmlHeight)
  } catch (error) {
    if (error instanceof FrameSheetCliError) throw error
    // The later browser load will report the missing file with more context.
  }

  return { entry, width, height }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose())
  })
}

export function buildProjectServerEntryUrl(port: number, entry: string): string {
  const normalizedEntry = normalizeProjectRelativePath(entry)
  const encodedEntry = normalizedEntry
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `http://127.0.0.1:${port}/${encodedEntry}`
}

async function resolveGsapRuntimePath(repoRoot?: string): Promise<string | null> {
  const candidates = [
    repoRoot ? resolve(repoRoot, "node_modules", "gsap", "dist", "gsap.min.js") : null,
    (() => {
      const packageJsonPath = resolvePackageJsonPath("gsap")
      return packageJsonPath ? resolve(dirname(packageJsonPath), "dist", "gsap.min.js") : null
    })(),
  ].filter((path): path is string => Boolean(path))

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  return null
}

async function serveProject(projectDir: string, entry: string, repoRoot?: string): Promise<{
  server: Server
  url: string
}> {
  const projectRealPath = await realpath(projectDir)
  const gsapPath = await resolveGsapRuntimePath(repoRoot)
  let allowedHost: string | null = null
  const server = createServer(async (request, response) => {
    try {
      if (allowedHost && request.headers.host !== allowedHost) {
        response.writeHead(403)
        response.end("Forbidden")
        return
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405)
        response.end("Method not allowed")
        return
      }
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
      if (requestUrl.pathname === "/__ripple_vendor/gsap.min.js") {
        if (!gsapPath) {
          response.writeHead(404)
          response.end("Not found")
          return
        }
        const file = await readFile(gsapPath)
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" })
        response.end(request.method === "HEAD" ? undefined : file)
        return
      }
      const requestPath = requestUrl.pathname === "/"
        ? entry
        : decodeURIComponent(requestUrl.pathname)
      const resolved = await resolveProjectServerFile(projectRealPath, requestPath)
      if (!resolved.ok) {
        response.writeHead(resolved.status)
        response.end(resolved.status === 403 ? "Forbidden" : "Not found")
        return
      }
      response.writeHead(200, { "content-type": resolved.contentType })
      if (request.method === "HEAD") {
        response.end()
        return
      }
      const file = await readFile(resolved.path)
      if (gsapPath && resolved.contentType.startsWith("text/html")) {
        response.end(String(file).replace(
          /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"']+\/dist\/gsap\.min\.js/g,
          "/__ripple_vendor/gsap.min.js",
        ))
        return
      }
      response.end(file)
    } catch (error) {
      const code = error instanceof URIError || error instanceof FrameSheetCliError
        ? 403
        : (error as NodeJS.ErrnoException).code === "ENOENT"
        ? 404
        : 500
      response.writeHead(code)
      response.end(code === 403 ? "Forbidden" : code === 404 ? "Not found" : "Server error")
    }
  })

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    server.on("error", rejectPort)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address === "object" && address?.port) {
        resolvePort(address.port)
      } else {
        rejectPort(new Error("Failed to bind local capture server."))
      }
    })
  })
  allowedHost = `127.0.0.1:${port}`

  return {
    server,
    url: buildProjectServerEntryUrl(port, entry),
  }
}

function withBundledWsFallbacks(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    WS_NO_BUFFER_UTIL: env.WS_NO_BUFFER_UTIL ?? "1",
    WS_NO_UTF_8_VALIDATE: env.WS_NO_UTF_8_VALIDATE ?? "1",
  }
}

function applyBundledWsFallbacksToProcess(): () => void {
  const previousBufferUtil = process.env.WS_NO_BUFFER_UTIL
  const previousUtf8Validate = process.env.WS_NO_UTF_8_VALIDATE

  process.env.WS_NO_BUFFER_UTIL = previousBufferUtil ?? "1"
  process.env.WS_NO_UTF_8_VALIDATE = previousUtf8Validate ?? "1"

  return () => {
    if (previousBufferUtil === undefined) {
      delete process.env.WS_NO_BUFFER_UTIL
    } else {
      process.env.WS_NO_BUFFER_UTIL = previousBufferUtil
    }
    if (previousUtf8Validate === undefined) {
      delete process.env.WS_NO_UTF_8_VALIDATE
    } else {
      process.env.WS_NO_UTF_8_VALIDATE = previousUtf8Validate
    }
  }
}

async function loadCapturePage(input: {
  page: any
  url: string
  timeoutMs: number
}): Promise<void> {
  await input.page.goto(input.url, {
    waitUntil: "domcontentloaded",
    timeout: Math.max(5_000, input.timeoutMs),
  })
  await input.page.waitForFunction(
    () => {
      const win = window as any
      return Boolean(
        win.__playerReady ||
        win.__player ||
        win.__timelines ||
        document.querySelector("[data-composition-id]"),
      )
    },
    { timeout: Math.max(1_000, input.timeoutMs) },
  )
}

function isAllowedCaptureRequestUrl(url: string, allowedOrigin: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.origin === allowedOrigin ||
      parsed.protocol === "data:" ||
      parsed.protocol === "blob:" ||
      parsed.protocol === "about:"
  } catch {
    return false
  }
}

async function restrictCapturePageRequests(input: {
  page: any
  allowedOrigin: string
}): Promise<void> {
  await input.page.setRequestInterception(true)
  input.page.on("request", (request: any) => {
    if (typeof request.isInterceptResolutionHandled === "function" && request.isInterceptResolutionHandled()) {
      return
    }
    if (isAllowedCaptureRequestUrl(request.url(), input.allowedOrigin)) {
      void request.continue().catch(() => undefined)
      return
    }
    void request.abort().catch(() => undefined)
  })
}

async function captureFramesWithFastBrowser(input: {
  projectDir: string
  timestampsMs: number[]
  timeoutMs: number
  columns: number
  maxSheetWidth: number
  settleMs: number
  env: NodeJS.ProcessEnv
  repoRoot?: string
}): Promise<FrameSheetCaptureResult> {
  const browserPath = resolveProducerBrowserPath(input.repoRoot)
  if (!browserPath) {
    throw new FrameSheetCliError(
      "FAST_BROWSER_MISSING",
      "Ripple could not find an app-managed browser for fast frame capture.",
    )
  }

  const metadata = await readProjectMetadata(input.projectDir)
  const cellWidth = Math.max(160, Math.floor(input.maxSheetWidth / input.columns))
  const cellHeight = Math.max(90, Math.round(cellWidth * (metadata.height / metadata.width)))
  const captureDir = join(
    input.projectDir,
    ".ripple",
    "frame-sheets",
    `.fast-capture-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  )
  await mkdir(captureDir, { recursive: true })

  let server: Server | null = null
  let browser: any = null
  const restoreWsFallbacks = applyBundledWsFallbacksToProcess()
  try {
    const puppeteer = await import("puppeteer-core")
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath: browserPath,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
      env: withBundledWsFallbacks(input.env),
    })

    const page = await browser.newPage()
    await page.setViewport({
      width: cellWidth,
      height: cellHeight,
      deviceScaleFactor: 1,
    })
    const served = await serveProject(input.projectDir, metadata.entry, input.repoRoot)
    server = served.server
    await restrictCapturePageRequests({
      page,
      allowedOrigin: new URL(served.url).origin,
    })
    await loadCapturePage({
      page,
      url: served.url,
      timeoutMs: input.timeoutMs,
    })
    await page.evaluate((dimensions: {
      sourceWidth: number
      sourceHeight: number
      targetWidth: number
      targetHeight: number
    }) => {
      const { sourceWidth, sourceHeight, targetWidth, targetHeight } = dimensions
      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
      document.documentElement.style.width = `${targetWidth}px`
      document.documentElement.style.height = `${targetHeight}px`
      document.documentElement.style.overflow = "hidden"
      document.body.style.width = `${sourceWidth}px`
      document.body.style.height = `${sourceHeight}px`
      document.body.style.overflow = "hidden"
      document.body.style.transformOrigin = "0 0"
      document.body.style.transform = `scale(${scale})`
      const root = document.querySelector<HTMLElement>("[data-composition-id][data-width][data-height]")
      if (root) {
        root.style.width = `${sourceWidth}px`
        root.style.height = `${sourceHeight}px`
        if (!root.style.position) root.style.position = "relative"
        root.style.overflow = "hidden"
      }
    }, {
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      targetWidth: cellWidth,
      targetHeight: cellHeight,
    })

    const framePaths: string[] = []
    for (const [index, timeMs] of input.timestampsMs.entries()) {
      const seconds = timeMs / 1000
      await page.evaluate((time: number) => {
        const win = window as any
        if (win.__player?.seek) {
          win.__player.seek(time)
          return
        }
        const timelines = win.__timelines
        if (!timelines) return
        for (const key of Object.keys(timelines)) {
          const timeline = timelines[key]
          if (!timeline) continue
          if (typeof timeline.pause === "function") timeline.pause()
          if (typeof timeline.totalTime === "function") {
            timeline.totalTime(time, false)
          } else if (typeof timeline.seek === "function") {
            timeline.seek(time, false)
          }
        }
      }, seconds)
      await page.evaluate(() => new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
      }))
      if (input.settleMs > 0) {
        await delay(input.settleMs)
      }
      const framePath = join(captureDir, `${String(index).padStart(3, "0")}.png`)
      await page.screenshot({
        path: framePath,
        type: "png",
        clip: {
          x: 0,
          y: 0,
          width: cellWidth,
          height: cellHeight,
        },
      })
      framePaths.push(framePath)
    }

    return {
      framePaths,
      cleanupPaths: [captureDir],
    }
  } catch (error) {
    if (error instanceof FrameSheetCliError) throw error
    throw new FrameSheetCliError(
      "FAST_CAPTURE_FAILED",
      error instanceof Error ? `Fast frame capture failed: ${error.message}` : "Fast frame capture failed.",
    )
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    if (server) {
      await closeServer(server).catch(() => undefined)
    }
    restoreWsFallbacks()
  }
}

async function captureFramesForSheet(input: {
  projectDir: string
  timestampsMs: number[]
  timeoutMs: number
  columns: number
  rows: number
  maxSheetWidth: number
  settleMs: number
  captureMode: FrameSheetCaptureMode
  env: NodeJS.ProcessEnv
  repoRoot?: string
}): Promise<FrameSheetCaptureResult> {
  if (input.captureMode === "hyperframes") {
    return captureFramesWithHyperframes(input)
  }

  try {
    return await captureFramesWithFastBrowser(input)
  } catch (error) {
    if (error instanceof FrameSheetCliError && error.code === "FAST_BROWSER_MISSING") {
      return captureFramesWithHyperframes(input)
    }
    throw error
  }
}

async function assembleSheetWithFfmpeg(input: {
  framesDir: string
  outputPath: string
  columns: number
  rows: number
  maxSheetWidth: number
  env: NodeJS.ProcessEnv
}): Promise<void> {
  const cellWidth = Math.max(120, Math.floor(input.maxSheetWidth / input.columns))
  const ffmpegCandidates = [
    ...getAppManagedCommandCandidates("ffmpeg"),
    "ffmpeg",
  ]
  const filter = [
    `scale=${cellWidth}:-2:force_original_aspect_ratio=decrease`,
    `tile=${input.columns}x${input.rows}`,
  ].join(",")
  const args = [
    "-y",
    "-framerate",
    "1",
    "-i",
    join(input.framesDir, "%03d.png"),
    "-frames:v",
    "1",
    "-vf",
    filter,
    input.outputPath,
  ]

  let lastError: unknown
  for (const candidate of ffmpegCandidates) {
    try {
      await execFileAsync(candidate, args, {
        env: input.env,
        timeout: 30_000,
      })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw new FrameSheetCliError(
    "FFMPEG_TILE_FAILED",
    lastError instanceof Error
      ? `FFmpeg could not assemble the frame sheet: ${lastError.message}`
      : "FFmpeg could not assemble the frame sheet.",
  )
}

async function copyCapturedFrames(input: {
  projectDir: string
  framePaths: string[]
  framesDir: string
}): Promise<string[]> {
  await mkdir(input.framesDir, { recursive: true })
  const copied: string[] = []
  for (const [index, sourcePath] of input.framePaths.entries()) {
    const sourceRealPath = await realpath(sourcePath)
    if (!isPathInsideDirectory(input.projectDir, sourceRealPath)) {
      throw new FrameSheetCliError(
        "SNAPSHOT_PATH_ESCAPE",
        "HyperFrames produced a snapshot outside the project.",
      )
    }
    const destination = join(input.framesDir, `${String(index).padStart(3, "0")}.png`)
    await copyFile(sourcePath, destination)
    const copiedStat = await stat(destination)
    if (!copiedStat.isFile() || copiedStat.size <= 0) {
      throw new FrameSheetCliError("EMPTY_FRAME", "HyperFrames produced an empty frame.")
    }
    copied.push(destination)
  }
  return copied
}

async function cleanupSnapshotIntermediates(paths: string[]): Promise<void> {
  for (const path of paths) {
    await rm(path, { recursive: true, force: true }).catch(() => undefined)
  }
}

function frameForTime(timeMs: number, fps: number): number {
  return Math.round((timeMs / 1000) * fps)
}

function buildSummary(timestampsMs: number[]): string {
  const first = timestampsMs[0]
  const last = timestampsMs[timestampsMs.length - 1]
  if (timestampsMs.length === 1) {
    return `Frame sheet with 1 sample at ${secondsLabel(first)}.`
  }
  return `Frame sheet with ${timestampsMs.length} samples from ${secondsLabel(first)} to ${secondsLabel(last)}.`
}

async function readProjectFps(projectDir: string): Promise<number | null> {
  try {
    const parsed = JSON.parse(await readFile(join(projectDir, "hyperframes.json"), "utf8"))
    if (isRecord(parsed) && typeof parsed.fps === "number" && Number.isFinite(parsed.fps) && parsed.fps > 0) {
      return Math.round(parsed.fps)
    }
  } catch {
    // Fall back to the CLI/default FPS.
  }
  return null
}

async function createOutputDirectories(input: {
  frameSheetsRoot: string
  id: string
}): Promise<{ tempDir: string; finalDir: string }> {
  const finalDir = join(input.frameSheetsRoot, input.id)
  const tempDir = join(input.frameSheetsRoot, `.tmp-${input.id}`)
  await mkdir(tempDir, { recursive: false })
  return { tempDir, finalDir }
}

async function assertGeneratedFile(path: string, code: string, message: string): Promise<void> {
  const info = await stat(path)
  if (!info.isFile() || info.size <= 0) {
    throw new FrameSheetCliError(code, message)
  }
}

export function frameSheetHelpText(): string {
  return [
    "Usage: ripple frame-sheet [options]",
    "",
    "Generate a project-local contact sheet from HyperFrames frames.",
    "",
    "Options:",
    "  --dir <path>              Project directory (default: current directory)",
    "  --at <times>              Comma-separated timestamps, e.g. 0s,1.5s,3s",
    "  --range <start..end>      Time range, e.g. 2s..8s",
    "  --samples <count>         Evenly sample a range (default: 8)",
    "  --every <duration>        Sample a range every duration, e.g. 1s",
    "  --every-frames <count>    Sample every N frames; uses --fps or project fps",
    "  --fps <fps>               FPS for frame math (default: project fps or 30)",
    "  --columns <count>         Sheet columns, 1-4 (default: up to 4)",
    "  --capture <mode>          Capture mode: fast or hyperframes (default: fast)",
    "  --settle <ms>             Extra wait after each seek in fast mode (default: 50)",
    "  --timeout <ms>            Browser/runtime initialization timeout (default: 5000)",
    "  --max-sheet-width <px>    Maximum output sheet width (default: 1440)",
    "  --json                    Print machine-readable JSON",
    "  --help                    Show this help",
    "",
  ].join("\n")
}

function successText(success: FrameSheetSuccessJson): string {
  return [
    success.sheet.summary,
    `Sheet: ${success.sheet.path}`,
    `Manifest: ${success.sheet.manifestPath}`,
    "",
  ].join("\n")
}

function jsonError(error: unknown): FrameSheetErrorJson {
  if (error instanceof FrameSheetCliError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    }
  }
  return {
    ok: false,
    error: {
      code: "FRAME_SHEET_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  }
}

export async function runFrameSheetCommand(
  args: string[],
  options: FrameSheetCommandOptions = {},
): Promise<FrameSheetCliResult> {
  const wantsJson = args.includes("--json") || args.some((arg) => arg.startsWith("--json="))
  try {
    const parsed = parseArgs(args)
    if (parsed.help) {
      return { exitCode: 0, stdout: frameSheetHelpText(), stderr: "" }
    }

    const baseCwd = resolve(options.cwd ?? process.cwd())
    const projectDir = await assertExistingProjectDir(
      isAbsolute(parsed.dir) ? parsed.dir : resolve(baseCwd, parsed.dir),
    )
    const env = buildHyperframesEnvironment({
      ...process.env,
      ...(options.env ?? {}),
    }, { repoRoot: options.repoRoot })
    const captureEnv = withBundledWsFallbacks(env)
    await assertWorkspaceBoundary({ projectDir, env })

    const projectFps = await readProjectFps(projectDir)
    const fps = parsed.fps === DEFAULT_FPS && projectFps ? projectFps : parsed.fps
    const { timestampsMs, rangeMs } = resolveFrameSheetTimestamps({
      ...parsed,
      fps,
    })
    const columns = getColumns(timestampsMs.length, parsed.columns)
    const rows = Math.ceil(timestampsMs.length / columns)
    const now = options.now ?? Date.now
    const frameSheetsRoot = await prepareFrameSheetRoot(projectDir)
    const idFactory = options.idFactory ?? (() => `fs_${randomUUID().replace(/-/g, "").slice(0, 12)}`)
    const id = idFactory()
    const { tempDir, finalDir } = await createOutputDirectories({ frameSheetsRoot, id })
    const framesDir = join(tempDir, "frames")
    const sheetPath = join(tempDir, "sheet.png")
    const manifestPath = join(tempDir, "manifest.json")
    const finalSheetPath = join(finalDir, "sheet.png")
    const finalManifestPath = join(finalDir, "manifest.json")
    const captureFrames = options.captureFrames ?? captureFramesForSheet
    const assembleSheet = options.assembleSheet ?? assembleSheetWithFfmpeg

    try {
      const capture = await withCaptureLock({
        frameSheetsRoot,
        now,
        fn: () => captureFrames({
          projectDir,
          timestampsMs,
          timeoutMs: parsed.timeoutMs,
          columns,
          rows,
          maxSheetWidth: parsed.maxSheetWidth,
          settleMs: parsed.settleMs,
          captureMode: parsed.captureMode,
          env: captureEnv,
          repoRoot: options.repoRoot,
        }),
      })
      if (capture.framePaths.length !== timestampsMs.length) {
        throw new FrameSheetCliError(
          "SNAPSHOT_SAMPLE_MISMATCH",
          `Captured ${capture.framePaths.length} frame(s), expected ${timestampsMs.length}.`,
        )
      }

      const copiedFrames = await copyCapturedFrames({
        projectDir,
        framePaths: capture.framePaths,
        framesDir,
      })
      await cleanupSnapshotIntermediates(capture.cleanupPaths ?? [])
      await assembleSheet({
        framesDir,
        outputPath: sheetPath,
        columns,
        rows,
        maxSheetWidth: parsed.maxSheetWidth,
        env: captureEnv,
      })
      await assertGeneratedFile(sheetPath, "EMPTY_SHEET", "FFmpeg produced an empty frame sheet.")

      const finalRelativeRoot = relativeProjectPath(projectDir, finalDir)
      const manifest: FrameSheetManifest = {
        version: 1,
        id,
        kind: "frame_sheet",
        projectDir: ".",
        rangeMs,
        fps,
        columns,
        rows,
        sheetPath: `${finalRelativeRoot}/sheet.png`,
        samples: copiedFrames.map((_path, index) => ({
          index,
          timeMs: timestampsMs[index],
          frame: frameForTime(timestampsMs[index], fps),
          path: `${finalRelativeRoot}/frames/${String(index).padStart(3, "0")}.png`,
        })),
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
      await rename(tempDir, finalDir)
      await assertGeneratedFile(finalSheetPath, "EMPTY_SHEET", "FFmpeg produced an empty frame sheet.")
      await assertGeneratedFile(finalManifestPath, "MANIFEST_MISSING", "Frame-sheet manifest was not written.")

      const success: FrameSheetSuccessJson = {
        ok: true,
        sheet: {
          id,
          path: manifest.sheetPath,
          manifestPath: relativeProjectPath(projectDir, finalManifestPath),
          sampleCount: timestampsMs.length,
          summary: buildSummary(timestampsMs),
        },
      }

      return {
        exitCode: 0,
        stdout: parsed.json ? formatJson(success) : successText(success),
        stderr: "",
      }
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true })
      throw error
    }
  } catch (error) {
    const payload = jsonError(error)
    return {
      exitCode: 1,
      stdout: wantsJson ? formatJson(payload) : "",
      stderr: wantsJson ? "" : `${payload.error.message}\n`,
    }
  }
}

export function buildRippleCliPathEnv(input: {
  baseEnv?: NodeJS.ProcessEnv
  directories: string[]
}): NodeJS.ProcessEnv {
  const baseEnv = input.baseEnv ?? process.env
  const existingPath = baseEnv.PATH ?? baseEnv.Path ?? ""
  const pathValue = [
    ...input.directories,
    existingPath,
  ].filter(Boolean).join(delimiter)

  return {
    ...baseEnv,
    PATH: pathValue,
    Path: process.platform === "win32" ? pathValue : baseEnv.Path,
  }
}
