import { copyFile, mkdir, lstat, readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { isPathInsideDirectory } from "../shared/path-boundary"
import {
  RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION,
  type RippleVisualContextHandoffManifest,
} from "../shared/visual-context-handoff"
import {
  buildHyperframesEnvironment,
} from "../main/lib/hyperframes/runtime"
import {
  createVisualContextService,
  type VisualCaptureFramesResult,
  type VisualContextBackendId,
} from "../main/lib/visual-context"
import {
  FrameSheetCliError,
  type FrameSheetCaptureResult,
  type FrameSheetCliResult,
  type FrameSheetCommandOptions,
  runFrameSheetCommand,
} from "./frame-sheet"

const DEFAULT_FPS = 30
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

type VisualSubcommand = "snapshot" | "sheet" | "context"

interface VisualSnapshotArgs {
  dir: string
  json: boolean
  help: boolean
  at: number | "current" | null
  compositionPath: string | null
  fps: number
  width: number
  height: number
  timeoutMs: number
  backend: VisualContextBackendId | null
}

export interface VisualCommandOptions extends FrameSheetCommandOptions {
  captureSnapshot?: (input: {
    projectDir: string
    timeMs: number
    compositionPath?: string | null
    width: number
    height: number
    fps: number
    timeoutMs: number
    backend?: VisualContextBackendId
    outputDir: string
    repoRoot?: string
  }) => Promise<VisualCaptureFramesResult>
}

class VisualCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "VisualCliError"
  }
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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
    throw new VisualCliError("MISSING_OPTION_VALUE", `${flag} requires a value.`)
  }
  return { value, nextIndex: index + 2 }
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new VisualCliError("INVALID_NUMBER", `${flag} must be a positive integer.`)
  }
  return parsed
}

function parseTimeToMs(value: string, label: string): number {
  const trimmed = value.trim().toLowerCase()
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)?$/.exec(trimmed)
  if (!match) {
    throw new VisualCliError("INVALID_TIME", `${label} must be a timestamp like 1.5s or 1500ms.`)
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) {
    throw new VisualCliError("INVALID_TIME", `${label} must be a non-negative timestamp.`)
  }
  const unit = match[2] ?? "s"
  return Math.round(unit === "ms" ? amount : amount * 1000)
}

function parseBackend(value: string): VisualContextBackendId {
  if (
    value === "preview" ||
    value === "engine" ||
    value === "producer-capture" ||
    value === "fast-browser" ||
    value === "hyperframes-cli"
  ) {
    return value
  }
  throw new VisualCliError("INVALID_BACKEND", "--backend is not a known visual backend.")
}

function visualHelpText(): string {
  return [
    "Usage: ripple <snapshot|sheet|context> [options]",
    "",
    "Commands:",
    "  snapshot    Capture one visual frame at an explicit time",
    "  sheet       Create a compact frame sheet",
    "  context     Create a frame sheet plus manifest metadata",
    "",
  ].join("\n")
}

function visualSnapshotHelpText(): string {
  return [
    "Usage: ripple snapshot [options]",
    "",
    "Options:",
    "  --dir <path>             Project directory (default: .)",
    "  --at <time|current>      Timestamp such as 1.25s, or current inside the app",
    "  --composition <path>     Project-relative composition HTML",
    "  --backend <name>         engine, producer-capture, fast-browser, hyperframes-cli, preview",
    "  --width <px>             Capture viewport width",
    "  --height <px>            Capture viewport height",
    "  --fps <fps>              Frame rate for frame-number metadata",
    "  --timeout <ms>           Capture readiness timeout",
    "  --json                   Print JSON",
    "",
  ].join("\n")
}

function visualContextHelpText(): string {
  return [
    "Usage: ripple context [options]",
    "",
    "Options:",
    "  --dir <path>              Project directory (default: current directory)",
    "  --at <times>              Comma-separated timestamps, e.g. 0s,1.5s,3s",
    "  --range <start..end>      Time range, e.g. 2s..8s",
    "  --samples <count>         Evenly sample a range (default: 8)",
    "  --every <duration>        Sample a range every duration, e.g. 1s",
    "  --every-frames <count>    Sample every N frames; uses --fps or project fps",
    "  --composition <path>      Project-relative composition HTML",
    "  --backend <name>          engine, producer-capture, fast-browser, hyperframes-cli, preview",
    "  --columns <count>         Sheet columns, 1-4 (default: up to 4)",
    "  --json                    Print machine-readable JSON",
    "  --help                    Show this help",
    "",
  ].join("\n")
}

function parseSnapshotArgs(args: string[]): VisualSnapshotArgs {
  const parsed: VisualSnapshotArgs = {
    dir: ".",
    json: false,
    help: false,
    at: null,
    compositionPath: null,
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    backend: null,
  }

  for (let index = 0; index < args.length;) {
    const arg = args[index]
    if (arg === "--json") {
      parsed.json = true
      index += 1
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true
      index += 1
    } else if (arg === "--dir" || arg.startsWith("--dir=")) {
      const next = getFlagValue(args, index, "--dir")
      parsed.dir = next.value
      index = next.nextIndex
    } else if (arg === "--at" || arg.startsWith("--at=")) {
      const next = getFlagValue(args, index, "--at")
      parsed.at = next.value === "current" ? "current" : parseTimeToMs(next.value, "--at")
      index = next.nextIndex
    } else if (arg === "--composition" || arg.startsWith("--composition=")) {
      const next = getFlagValue(args, index, "--composition")
      parsed.compositionPath = next.value
      index = next.nextIndex
    } else if (arg === "--backend" || arg.startsWith("--backend=")) {
      const next = getFlagValue(args, index, "--backend")
      parsed.backend = parseBackend(next.value)
      index = next.nextIndex
    } else if (arg === "--width" || arg.startsWith("--width=")) {
      const next = getFlagValue(args, index, "--width")
      parsed.width = parsePositiveInteger(next.value, "--width")
      index = next.nextIndex
    } else if (arg === "--height" || arg.startsWith("--height=")) {
      const next = getFlagValue(args, index, "--height")
      parsed.height = parsePositiveInteger(next.value, "--height")
      index = next.nextIndex
    } else if (arg === "--fps" || arg.startsWith("--fps=")) {
      const next = getFlagValue(args, index, "--fps")
      parsed.fps = parsePositiveInteger(next.value, "--fps")
      index = next.nextIndex
    } else if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const next = getFlagValue(args, index, "--timeout")
      parsed.timeoutMs = parsePositiveInteger(next.value, "--timeout")
      index = next.nextIndex
    } else {
      throw new VisualCliError("UNKNOWN_OPTION", `Unknown snapshot option: ${arg}`)
    }
  }

  return parsed
}

async function assertExistingProjectDir(dir: string): Promise<string> {
  try {
    const resolved = await realpath(dir)
    const info = await stat(resolved)
    if (!info.isDirectory()) {
      throw new VisualCliError("PROJECT_DIR_INVALID", "--dir must be a project directory.")
    }
    return resolved
  } catch (error) {
    if (error instanceof VisualCliError) throw error
    throw new VisualCliError("PROJECT_DIR_INVALID", "--dir must be an existing project directory.")
  }
}

async function assertWorkspaceBoundary(input: {
  projectDir: string
  env: NodeJS.ProcessEnv
}): Promise<void> {
  const workspaceRoot = input.env.RIPPLE_AGENT_WORKSPACE_ROOT?.trim()
  if (!workspaceRoot) return
  const workspaceRealPath = await realpath(workspaceRoot).catch(() => {
    throw new VisualCliError(
      "WORKSPACE_ROOT_MISSING",
      "RIPPLE_AGENT_WORKSPACE_ROOT does not point to an existing workspace.",
    )
  })
  if (!isPathInsideDirectory(workspaceRealPath, input.projectDir)) {
    throw new VisualCliError(
      "WORKSPACE_OUTSIDE_AGENT_ROOT",
      "--dir must be inside RIPPLE_AGENT_WORKSPACE_ROOT.",
    )
  }
}

async function assertExistingSymlinkInsideProject(projectDir: string, targetPath: string): Promise<void> {
  try {
    const info = await lstat(targetPath)
    if (!info.isSymbolicLink()) return
    const resolved = await realpath(targetPath)
    if (!isPathInsideDirectory(projectDir, resolved)) {
      throw new VisualCliError(
        "OUTPUT_PATH_ESCAPE",
        "Visual output path resolves outside the project.",
      )
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

async function prepareSnapshotOutputDir(projectDir: string, id: string): Promise<string> {
  const rippleDir = resolve(projectDir, ".ripple")
  const root = resolve(rippleDir, "visual-context", "snapshots")
  await assertExistingSymlinkInsideProject(projectDir, rippleDir)
  await assertExistingSymlinkInsideProject(projectDir, root)
  await mkdir(root, { recursive: true })
  const rootRealPath = await realpath(root)
  if (!isPathInsideDirectory(projectDir, rootRealPath)) {
    throw new VisualCliError("OUTPUT_PATH_ESCAPE", "Visual output path resolves outside the project.")
  }
  const outputDir = join(root, id)
  await mkdir(outputDir, { recursive: false })
  return outputDir
}

async function readVisualProjectMetadata(projectDir: string): Promise<{
  fps: number | null
  width: number | null
  height: number | null
}> {
  try {
    const parsed = JSON.parse(await readFile(join(projectDir, "hyperframes.json"), "utf8"))
    if (!isRecord(parsed)) return { fps: null, width: null, height: null }
    return {
      fps: typeof parsed.fps === "number" && parsed.fps > 0 ? Math.round(parsed.fps) : null,
      width: typeof parsed.width === "number" && parsed.width > 0 ? Math.round(parsed.width) : null,
      height: typeof parsed.height === "number" && parsed.height > 0 ? Math.round(parsed.height) : null,
    }
  } catch {
    return { fps: null, width: null, height: null }
  }
}

function jsonError(error: unknown): { ok: false; error: { code: string; message: string } } {
  if (error instanceof VisualCliError || error instanceof FrameSheetCliError) {
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
      code: "VISUAL_COMMAND_FAILED",
      message: error instanceof Error ? error.message : "Visual command failed.",
    },
  }
}

function visualEndpointFromEnv(env: NodeJS.ProcessEnv): { endpoint: string; token: string } | null {
  const endpoint = env.RIPPLE_VISUAL_CONTEXT_ENDPOINT?.trim()
  const token = env.RIPPLE_VISUAL_CONTEXT_TOKEN?.trim()
  return endpoint && token ? { endpoint: endpoint.replace(/\/+$/, ""), token } : null
}

async function visualHandoffFromEnv(input: {
  env: NodeJS.ProcessEnv
  projectDir: string
}): Promise<RippleVisualContextHandoffManifest | null> {
  const manifestPath = input.env.RIPPLE_VISUAL_CONTEXT_MANIFEST?.trim()
  if (!manifestPath) return null
  const manifestRealPath = await realpath(resolve(manifestPath)).catch(() => null)
  if (!manifestRealPath || !isPathInsideDirectory(input.projectDir, manifestRealPath)) return null

  const parsed = JSON.parse(await readFile(manifestRealPath, "utf8")) as unknown
  if (!isRecord(parsed) || parsed.version !== RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION) return null
  const projectPath = typeof parsed.projectPath === "string" ? parsed.projectPath : null
  if (!projectPath) return null
  const handoffProjectRealPath = await realpath(resolve(projectPath)).catch(() => null)
  if (handoffProjectRealPath !== input.projectDir) return null
  return parsed as unknown as RippleVisualContextHandoffManifest
}

function handoffCompositionMatches(input: {
  requestedCompositionPath: string | null
  handoffCompositionPath: string | null
}): boolean {
  return !input.requestedCompositionPath ||
    !input.handoffCompositionPath ||
    input.requestedCompositionPath === input.handoffCompositionPath
}

function handoffTimeMatches(input: {
  requestedAt: number | "current"
  snapshotTimeMs: number
  fps: number
}): boolean {
  if (input.requestedAt === "current") return true
  const frameDurationMs = 1000 / Math.max(1, input.fps)
  return Math.abs(input.requestedAt - input.snapshotTimeMs) <= frameDurationMs
}

async function captureSnapshotFromHandoff(input: {
  manifest: RippleVisualContextHandoffManifest
  projectDir: string
  outputDir: string
  at: number | "current"
  compositionPath: string | null
  fps: number
}): Promise<VisualCaptureFramesResult | null> {
  const snapshot = input.manifest.snapshot
  if (!snapshot) return null
  if (!handoffCompositionMatches({
    requestedCompositionPath: input.compositionPath,
    handoffCompositionPath: input.manifest.compositionPath,
  })) {
    return null
  }
  if (!handoffTimeMatches({
    requestedAt: input.at,
    snapshotTimeMs: snapshot.timeMs,
    fps: input.fps,
  })) {
    return null
  }

  const sourcePath = resolve(input.projectDir, snapshot.path)
  const sourceRealPath = await realpath(sourcePath)
  if (!isPathInsideDirectory(input.projectDir, sourceRealPath)) {
    throw new VisualCliError("HANDOFF_PATH_ESCAPE", "Visual context handoff snapshot is outside the project.")
  }
  const destination = join(input.outputDir, "handoff.png")
  await copyFile(sourceRealPath, destination)
  const info = await stat(destination)
  return {
    backend: snapshot.backend as VisualContextBackendId,
    frames: [{
      index: 0,
      timeMs: snapshot.timeMs,
      frame: snapshot.frame,
      path: destination,
      width: snapshot.width,
      height: snapshot.height,
      sizeBytes: info.size,
    }],
    elapsedMs: 0,
    timings: { handoffMs: 0 },
    warnings: [
      "Used app-prepared visual context handoff because this agent run cannot rely on localhost capture.",
    ],
    cleanupPaths: [],
  }
}

async function sheetResultFromHandoff(input: {
  args: string[]
  env: NodeJS.ProcessEnv
  projectDir: string
  wantsJson: boolean
}): Promise<FrameSheetCliResult | null> {
  if (input.args.includes("--help") || input.args.includes("-h")) return null
  const manifest = await visualHandoffFromEnv({
    env: input.env,
    projectDir: input.projectDir,
  })
  const sheet = manifest?.sheet
  if (!manifest || !sheet) return null
  const compositionOption = extractOption(input.args, "--composition")
  if (!handoffCompositionMatches({
    requestedCompositionPath: compositionOption.value,
    handoffCompositionPath: manifest.compositionPath,
  })) {
    return null
  }
  const [sheetRealPath, manifestRealPath] = await Promise.all([
    realpath(resolve(input.projectDir, sheet.path)),
    realpath(resolve(input.projectDir, sheet.manifestPath)),
  ])
  if (
    !isPathInsideDirectory(input.projectDir, sheetRealPath) ||
    !isPathInsideDirectory(input.projectDir, manifestRealPath)
  ) {
    throw new VisualCliError("HANDOFF_PATH_ESCAPE", "Visual context handoff sheet is outside the project.")
  }
  const payload = {
    ok: true,
    backend: sheet.backend,
    fallbackFrom: "visual-context-handoff",
    sheet: {
      id: sheet.id,
      path: sheet.path,
      manifestPath: sheet.manifestPath,
      sampleCount: sheet.sampleCount,
      summary: sheet.summary,
    },
    elapsedMs: 0,
    warnings: [
      "Used app-prepared visual context handoff because this agent run cannot rely on localhost capture.",
    ],
  }
  return {
    exitCode: 0,
    stdout: input.wantsJson
      ? formatJson(payload)
      : `Created frame sheet: ${sheet.path}\n`,
    stderr: "",
  }
}

async function requestVisualEndpointSnapshot(input: {
  endpoint: string
  token: string
  body: Record<string, unknown>
}): Promise<VisualCaptureFramesResult> {
  return requestVisualEndpointCapture({
    endpoint: input.endpoint,
    token: input.token,
    path: "/snapshot",
    body: input.body,
  })
}

async function requestVisualEndpointFrames(input: {
  endpoint: string
  token: string
  body: Record<string, unknown>
}): Promise<VisualCaptureFramesResult> {
  return requestVisualEndpointCapture({
    endpoint: input.endpoint,
    token: input.token,
    path: "/capture-frames",
    body: input.body,
  })
}

async function requestVisualEndpointCapture(input: {
  endpoint: string
  token: string
  path: "/snapshot" | "/capture-frames"
  body: Record<string, unknown>
}): Promise<VisualCaptureFramesResult> {
  const response = await fetch(`${input.endpoint}${input.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify(input.body),
  })
  const payload = await response.json() as {
    ok?: boolean
    result?: VisualCaptureFramesResult
    error?: { code?: string; message?: string }
  }
  if (!response.ok || !payload.ok || !payload.result) {
    throw new VisualCliError(
      payload.error?.code ?? "VISUAL_CONTEXT_ENDPOINT_FAILED",
      payload.error?.message ?? "Ripple visual context endpoint failed.",
    )
  }
  return payload.result
}

async function defaultCaptureSnapshot(input: {
  projectDir: string
  timeMs: number
  compositionPath?: string | null
  width: number
  height: number
  fps: number
  timeoutMs: number
  backend?: VisualContextBackendId
  outputDir: string
  repoRoot?: string
}): Promise<VisualCaptureFramesResult> {
  const service = createVisualContextService()
  try {
    return await service.captureSnapshot({
      projectPath: input.projectDir,
      compositionPath: input.compositionPath,
      timeMs: input.timeMs,
      fps: input.fps,
      width: input.width,
      height: input.height,
      format: "png",
      timeoutMs: input.timeoutMs,
      reason: "snapshot",
      preferredBackend: input.backend,
      repoRoot: input.repoRoot,
      outputDir: input.outputDir,
    })
  } finally {
    await service.shutdown()
  }
}

async function runVisualSnapshotCommand(
  args: string[],
  options: VisualCommandOptions = {},
): Promise<FrameSheetCliResult> {
  const wantsJson = args.includes("--json") || args.some((arg) => arg.startsWith("--json="))
  try {
    const parsed = parseSnapshotArgs(args)
    if (parsed.help) {
      return { exitCode: 0, stdout: visualSnapshotHelpText(), stderr: "" }
    }
    if (parsed.at === null) {
      throw new VisualCliError("MISSING_AT", "snapshot requires --at.")
    }

    const baseCwd = resolve(options.cwd ?? process.cwd())
    const projectDir = await assertExistingProjectDir(
      isAbsolute(parsed.dir) ? parsed.dir : resolve(baseCwd, parsed.dir),
    )
    const env = buildHyperframesEnvironment({
      ...process.env,
      ...(options.env ?? {}),
    }, { repoRoot: options.repoRoot })
    await assertWorkspaceBoundary({ projectDir, env })

    const metadata = await readVisualProjectMetadata(projectDir)
    const fps = parsed.fps === DEFAULT_FPS && metadata.fps ? metadata.fps : parsed.fps
    const width = parsed.width === DEFAULT_WIDTH && metadata.width ? metadata.width : parsed.width
    const height = parsed.height === DEFAULT_HEIGHT && metadata.height ? metadata.height : parsed.height
    const id = `snap_${(options.idFactory?.() ?? randomUUID().replace(/-/g, "").slice(0, 12)).replace(/^snap_/, "")}`
    const outputDir = await prepareSnapshotOutputDir(projectDir, id)
    const startedAt = performance.now()
    const handoff = await visualHandoffFromEnv({ env, projectDir })
    const handoffCapture = handoff
      ? await captureSnapshotFromHandoff({
        manifest: handoff,
        projectDir,
        outputDir,
        at: parsed.at,
        compositionPath: parsed.compositionPath,
        fps,
      })
      : null
    const endpoint = options.captureSnapshot ? null : visualEndpointFromEnv(env)
    const explicitTimeMs = parsed.at === "current" ? null : parsed.at
    if (explicitTimeMs === null && !handoffCapture && !endpoint) {
      throw new VisualCliError(
        "CURRENT_FRAME_REQUIRES_APP",
        "--at current requires the Ripple app visual context endpoint. Use an explicit timestamp outside the app.",
      )
    }
    const capture = handoffCapture ?? (endpoint
      ? await requestVisualEndpointSnapshot({
        ...endpoint,
        body: {
          projectPath: projectDir,
          compositionPath: parsed.compositionPath,
          ...(parsed.at === "current" ? { at: "current" } : { timeMs: parsed.at }),
          fps,
          width,
          height,
          format: "png",
          timeoutMs: parsed.timeoutMs,
          reason: "snapshot",
          preferredBackend: parsed.backend ?? undefined,
          repoRoot: options.repoRoot,
          outputDir,
        },
      })
      : await (options.captureSnapshot ?? defaultCaptureSnapshot)({
        projectDir,
        timeMs: explicitTimeMs!,
        compositionPath: parsed.compositionPath,
        width,
        height,
        fps,
        timeoutMs: parsed.timeoutMs,
        backend: parsed.backend ?? undefined,
        outputDir,
        repoRoot: options.repoRoot,
      })
    )
    const frame = capture.frames[0]
    if (!frame) {
      throw new VisualCliError("SNAPSHOT_MISSING", "Visual snapshot did not return a frame.")
    }

    const payload = {
      ok: true,
      backend: capture.backend,
      fallbackFrom: capture.fallbackFrom ?? null,
      snapshot: {
        id,
        path: relativeProjectPath(projectDir, frame.path),
        sample: {
          timeMs: frame.timeMs,
          frame: frame.frame,
        },
        width: frame.width,
        height: frame.height,
      },
      elapsedMs: Math.round(performance.now() - startedAt),
      timings: capture.timings,
      warnings: capture.warnings,
    }

    return {
      exitCode: 0,
      stdout: parsed.json ? formatJson(payload) : `Captured snapshot: ${payload.snapshot.path}\n`,
      stderr: "",
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

function extractOption(args: string[], flag: string): { args: string[]; value: string | null } {
  const nextArgs: string[] = []
  let value: string | null = null
  for (let index = 0; index < args.length;) {
    const arg = args[index]
    if (arg === flag || arg.startsWith(`${flag}=`)) {
      const next = getFlagValue(args, index, flag)
      value = next.value
      index = next.nextIndex
    } else {
      nextArgs.push(arg)
      index += 1
    }
  }
  return { args: nextArgs, value }
}

async function runVisualSheetCommand(
  args: string[],
  options: VisualCommandOptions = {},
): Promise<FrameSheetCliResult> {
  const startedAt = performance.now()
  const wantsJson = args.includes("--json") || args.some((arg) => arg.startsWith("--json="))
  try {
    const backendOption = extractOption(args, "--backend")
    const compositionOption = extractOption(backendOption.args, "--composition")
    const backend = backendOption.value ? parseBackend(backendOption.value) : null
    let forwardedArgs = compositionOption.args
    let reportedBackend: VisualContextBackendId = backend ?? "engine"
    if (!args.includes("--help") && !args.includes("-h")) {
      const baseCwd = resolve(options.cwd ?? process.cwd())
      const projectDir = await projectDirFromArgs(forwardedArgs, baseCwd)
      const env = buildHyperframesEnvironment({
        ...process.env,
        ...(options.env ?? {}),
      }, { repoRoot: options.repoRoot })
      await assertWorkspaceBoundary({ projectDir, env })
      const handoffResult = await sheetResultFromHandoff({
        args,
        env,
        projectDir,
        wantsJson,
      })
      if (handoffResult) return handoffResult
    }

    const shouldUseServiceCapture = !options.captureFrames

    const result = await runFrameSheetCommand(forwardedArgs, {
      ...options,
      captureFrames: shouldUseServiceCapture
        ? async (input): Promise<FrameSheetCaptureResult> => {
          const service = createVisualContextService()
          try {
            const metadata = await readVisualProjectMetadata(input.projectDir)
            const endpoint = visualEndpointFromEnv(input.env)
            const requestBody = {
              projectPath: input.projectDir,
              compositionPath: compositionOption.value,
              timestampsMs: input.timestampsMs,
              fps: metadata.fps ?? DEFAULT_FPS,
              width: metadata.width ?? DEFAULT_WIDTH,
              height: metadata.height ?? DEFAULT_HEIGHT,
              format: "png" as const,
              timeoutMs: input.timeoutMs,
              reason: "frame-sheet" as const,
              preferredBackend: backend ?? "engine",
              repoRoot: options.repoRoot,
            }
            const capture = endpoint
              ? await requestVisualEndpointFrames({
                ...endpoint,
                body: requestBody,
              })
              : await service.captureFrames(requestBody)
            reportedBackend = capture.backend
            return {
              framePaths: capture.frames.map((frame) => frame.path),
              cleanupPaths: capture.cleanupPaths,
            }
          } finally {
            await service.shutdown()
          }
        }
        : options.captureFrames,
    })

    if (!wantsJson || result.exitCode !== 0) return result

    const payload = JSON.parse(result.stdout)
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        backend: reportedBackend,
        fallbackFrom: null,
        sheet: payload.sheet,
        elapsedMs: Math.round(performance.now() - startedAt),
        warnings: [],
      }),
      stderr: "",
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

async function projectDirFromArgs(args: string[], cwd: string): Promise<string> {
  const dirOption = extractOption(args, "--dir")
  const dir = dirOption.value ?? "."
  return assertExistingProjectDir(isAbsolute(dir) ? dir : resolve(cwd, dir))
}

async function runVisualContextCommand(
  args: string[],
  options: VisualCommandOptions = {},
): Promise<FrameSheetCliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: visualContextHelpText(), stderr: "" }
  }
  const jsonArgs = args.includes("--json") ? args : [...args, "--json"]
  const sheetResult = await runVisualSheetCommand(jsonArgs, options)
  if (sheetResult.exitCode !== 0) return sheetResult

  const baseCwd = resolve(options.cwd ?? process.cwd())
  const projectDir = await projectDirFromArgs(args, baseCwd)
  const payload = JSON.parse(sheetResult.stdout)
  const manifestPath = payload.sheet?.manifestPath
  const manifest = manifestPath
    ? JSON.parse(await readFile(join(projectDir, manifestPath), "utf8"))
    : null
  const compositionOption = extractOption(args, "--composition")

  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      backend: payload.backend,
      fallbackFrom: payload.fallbackFrom ?? null,
      sheet: payload.sheet,
      context: {
        compositionPath: compositionOption.value ?? null,
        fps: isRecord(manifest) ? manifest.fps ?? null : null,
        rangeMs: isRecord(manifest) ? manifest.rangeMs ?? null : null,
        samples: isRecord(manifest) ? manifest.samples ?? [] : [],
      },
      elapsedMs: payload.elapsedMs,
      warnings: payload.warnings ?? [],
    }),
    stderr: "",
  }
}

export async function runVisualCommand(
  args: string[],
  options: VisualCommandOptions = {},
): Promise<FrameSheetCliResult> {
  const [subcommand, ...rest] = args
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return { exitCode: 0, stdout: visualHelpText(), stderr: "" }
  }

  if (subcommand === "snapshot") return runVisualSnapshotCommand(rest, options)
  if (subcommand === "sheet") return runVisualSheetCommand(rest, options)
  if (subcommand === "context") return runVisualContextCommand(rest, options)

  const wantsJson = rest.includes("--json") || args.includes("--json")
  const message = `Unknown ripple visual command: ${subcommand}`
  if (wantsJson) {
    return {
      exitCode: 1,
      stdout: formatJson({
        ok: false,
        error: {
          code: "UNKNOWN_VISUAL_COMMAND",
          message,
        },
      }),
      stderr: "",
    }
  }
  return { exitCode: 1, stdout: "", stderr: `${message}\n` }
}
