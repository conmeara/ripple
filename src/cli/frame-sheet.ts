import { randomUUID } from "node:crypto"
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
import { delimiter, isAbsolute, join, relative, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { isPathInsideDirectory } from "../shared/path-boundary"
import {
  buildHyperframesEnvironment,
  runHyperframesCommand,
} from "../main/lib/hyperframes/runtime"
import type { HyperframesCommandResult } from "../main/lib/hyperframes/types"
import {
  DEFAULT_FRAME_SHEET_FPS,
  VisualContextError,
  buildVisualProjectEntryUrl,
  assembleFrameSheetWithFfmpeg,
  buildFrameSheetManifest,
  buildFrameSheetSummary,
  captureFramesWithFastBrowser as captureFramesWithFastBrowserCore,
  getFrameSheetColumns,
  resolveVisualProjectFile,
  resolveFrameSheetTimestamps as resolveCoreFrameSheetTimestamps,
  withBundledWsFallbacks,
  type FrameSheetManifest,
  type FrameSheetSample,
  type VisualFastBrowserCaptureInput,
  type VisualProjectFileResolution,
} from "../main/lib/visual-context"

const DEFAULT_FPS = DEFAULT_FRAME_SHEET_FPS
const DEFAULT_MAX_SHEET_WIDTH = 1440
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_FAST_CAPTURE_SETTLE_MS = 0
const LOCK_STALE_MS = 2 * 60 * 1000
const LOCK_WAIT_MS = 15 * 1000

type FrameSheetCaptureMode = "fast" | "hyperframes"

export type { FrameSheetManifest, FrameSheetSample }

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

function relativeProjectPath(projectDir: string, path: string): string {
  return relative(projectDir, path).replace(/\\/g, "/")
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
    throw new FrameSheetCliError("UNKNOWN_OPTION", `Unknown sheet option: ${arg}`)
  }

  return parsed
}

export function resolveFrameSheetTimestamps(args: Pick<
  ParsedFrameSheetArgs,
  "at" | "range" | "samples" | "everyMs" | "everyFrames" | "fps"
>): { timestampsMs: number[]; rangeMs: [number, number] | null } {
  try {
    return resolveCoreFrameSheetTimestamps(args)
  } catch (error) {
    if (error instanceof VisualContextError) {
      throw new FrameSheetCliError(error.code, error.message)
    }
    throw error
  }
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

export type ProjectServerFileResolution = VisualProjectFileResolution

export async function resolveProjectServerFile(
  projectDir: string,
  projectRelativePath: string,
): Promise<ProjectServerFileResolution> {
  return resolveVisualProjectFile(projectDir, projectRelativePath)
}

async function readProjectTextFile(projectDir: string, projectRelativePath: string): Promise<string | null> {
  const resolved = await resolveProjectServerFile(projectDir, projectRelativePath)
  if (!resolved.ok) {
    if (resolved.status === 404) return null
    throw new FrameSheetCliError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
  }
  return readFile(resolved.path, "utf8")
}

export function buildProjectServerEntryUrl(port: number, entry: string): string {
  try {
    return buildVisualProjectEntryUrl(port, entry)
  } catch (error) {
    if (error instanceof Error) {
      throw new FrameSheetCliError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
    }
    throw error
  }
}

export async function captureFramesWithFastBrowser(
  input: VisualFastBrowserCaptureInput,
): Promise<FrameSheetCaptureResult> {
  try {
    return await captureFramesWithFastBrowserCore(input)
  } catch (error) {
    if (error instanceof VisualContextError) {
      throw new FrameSheetCliError(error.code, error.message)
    }
    throw error
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
  try {
    await assembleFrameSheetWithFfmpeg(input)
  } catch (error) {
    if (error instanceof VisualContextError) {
      throw new FrameSheetCliError(error.code, error.message)
    }
    throw error
  }
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
    "Usage: ripple sheet [options]",
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
    "  --settle <ms>             Extra wait after each seek in fast mode (default: 0)",
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
  if (error instanceof FrameSheetCliError || error instanceof VisualContextError) {
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
    const columns = getFrameSheetColumns(timestampsMs.length, parsed.columns)
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

      await copyCapturedFrames({
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
      const manifest = buildFrameSheetManifest({
        id,
        rangeMs,
        fps,
        columns,
        rows,
        finalRelativeRoot,
        timestampsMs,
      })
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
          summary: buildFrameSheetSummary(timestampsMs),
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
