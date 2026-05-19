import { mkdir, lstat, readFile, realpath, rename, stat, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { isPathInsideDirectory } from "../shared/path-boundary"
import { VISUAL_CONTEXT_FILE_BRIDGE_VERSION } from "../main/lib/visual-context"
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
    "Usage: ripple <snapshot|frame-sheet> [options]",
    "",
    "Commands:",
    "  snapshot       Capture the current frame or one exact visual frame",
    "  frame-sheet    Create a compact frame sheet across time",
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

function selectFrameSheetCaptureSize(input: {
  sourceWidth: number | null
  sourceHeight: number | null
  columns: number
  maxSheetWidth: number
}): { width: number; height: number } {
  const sourceWidth = input.sourceWidth ?? DEFAULT_WIDTH
  const sourceHeight = input.sourceHeight ?? DEFAULT_HEIGHT
  const cellWidth = Math.max(1, Math.ceil(input.maxSheetWidth / Math.max(1, input.columns)))
  const width = Math.max(1, Math.min(sourceWidth, cellWidth))
  const height = Math.max(1, Math.round(sourceHeight * (width / sourceWidth)))
  return { width, height }
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

function visualFileBridgeFromEnv(env: NodeJS.ProcessEnv): { requestDir: string; token: string } | null {
  const requestDir = env.RIPPLE_VISUAL_CONTEXT_BRIDGE_DIR?.trim()
  const token = env.RIPPLE_VISUAL_CONTEXT_BRIDGE_TOKEN?.trim()
  return requestDir && token ? { requestDir, token } : null
}

function shouldUseCleanVisualContext(env: NodeJS.ProcessEnv): boolean {
  return env.RIPPLE_AGENT_VISUAL_CONTEXT_MODE?.trim().toLowerCase() === "clean"
}

async function readFrameSheetManifest(
  projectDir: string,
  manifestPath: unknown,
): Promise<Record<string, any> | null> {
  if (typeof manifestPath !== "string" || !manifestPath.trim()) return null
  const manifestRealPath = await realpath(resolve(projectDir, manifestPath)).catch(() => null)
  if (!manifestRealPath || !isPathInsideDirectory(projectDir, manifestRealPath)) return null
  const parsed = JSON.parse(await readFile(manifestRealPath, "utf8")) as unknown
  return isRecord(parsed) ? parsed as Record<string, any> : null
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

async function requestVisualFileBridgeCapture(input: {
  requestDir: string
  token: string
  kind: "snapshot" | "capture-frames"
  body: Record<string, unknown>
}): Promise<VisualCaptureFramesResult> {
  await mkdir(input.requestDir, { recursive: true })
  const id = randomUUID().replace(/-/g, "")
  const requestPath = join(input.requestDir, `${id}.request.json`)
  const tempRequestPath = join(input.requestDir, `${id}.request.tmp`)
  const responsePath = join(input.requestDir, `${id}.response.json`)
  await writeFile(tempRequestPath, formatJson({
    version: VISUAL_CONTEXT_FILE_BRIDGE_VERSION,
    token: input.token,
    kind: input.kind,
    body: input.body,
  }), "utf8")
  await rename(tempRequestPath, requestPath)

  const requestedTimeoutMs = typeof input.body.timeoutMs === "number" && Number.isFinite(input.body.timeoutMs)
    ? input.body.timeoutMs
    : DEFAULT_TIMEOUT_MS
  const bridgeDeadlineMs = Math.max(45_000, requestedTimeoutMs * 4 + 15_000)
  const deadline = Date.now() + bridgeDeadlineMs
  let lastReadError: unknown = null
  while (Date.now() < deadline) {
    try {
      const response = JSON.parse(await readFile(responsePath, "utf8")) as {
        ok?: boolean
        result?: VisualCaptureFramesResult
        error?: { code?: string; message?: string }
      }
      if (response.ok && response.result) return response.result
      throw new VisualCliError(
        response.error?.code ?? "VISUAL_CONTEXT_BRIDGE_FAILED",
        response.error?.message ?? "Ripple visual context bridge failed.",
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        lastReadError = error
        if (error instanceof SyntaxError) {
          await delay(25)
          continue
        }
        throw error
      }
      lastReadError = error
    }
    await delay(25)
  }

  throw new VisualCliError(
    "VISUAL_CONTEXT_BRIDGE_TIMEOUT",
    lastReadError instanceof Error && lastReadError.name !== "Error"
      ? `Timed out waiting ${Math.round(bridgeDeadlineMs / 1000)}s for Ripple visual context bridge: ${lastReadError.message}`
      : `Timed out waiting ${Math.round(bridgeDeadlineMs / 1000)}s for Ripple visual context bridge.`,
  )
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
      intent: "specific-frame",
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
    const bridge = options.captureSnapshot ? null : visualFileBridgeFromEnv(env)
    const endpoint = options.captureSnapshot || bridge ? null : visualEndpointFromEnv(env)
    const appCapture = bridge ?? endpoint
    const explicitTimeMs = parsed.at === "current" ? null : parsed.at
    if (explicitTimeMs === null && !appCapture) {
      throw new VisualCliError(
        "CURRENT_FRAME_REQUIRES_APP",
        "--at current requires Ripple app visual context. Use an explicit timestamp outside the app.",
      )
    }
    const snapshotSource = explicitTimeMs === null
      ? { kind: "live-app", preEdit: false }
      : appCapture
        ? { kind: "app-render", preEdit: false }
        : { kind: "standalone-render", preEdit: false }
    const capture = explicitTimeMs === null
      ? bridge
        ? await requestVisualFileBridgeCapture({
          ...bridge,
          kind: "snapshot",
          body: {
            projectPath: projectDir,
            compositionPath: parsed.compositionPath,
            at: "current",
            fps,
            width,
            height,
            format: "png",
            timeoutMs: parsed.timeoutMs,
            reason: "snapshot",
            intent: "current-frame",
            preferredBackend: parsed.backend ?? undefined,
            repoRoot: options.repoRoot,
            outputDir,
          },
        })
        : await requestVisualEndpointSnapshot({
          ...endpoint!,
          body: {
            projectPath: projectDir,
            compositionPath: parsed.compositionPath,
            at: "current",
            fps,
            width,
            height,
            format: "png",
            timeoutMs: parsed.timeoutMs,
            reason: "snapshot",
            intent: "current-frame",
            preferredBackend: parsed.backend ?? undefined,
            repoRoot: options.repoRoot,
            outputDir,
          },
        })
      : bridge
        ? await requestVisualFileBridgeCapture({
        ...bridge,
        kind: "snapshot",
        body: {
          projectPath: projectDir,
          compositionPath: parsed.compositionPath,
          timeMs: parsed.at,
          fps,
          width,
          height,
          format: "png",
          timeoutMs: parsed.timeoutMs,
          reason: "snapshot",
          intent: "specific-frame",
          preferredBackend: parsed.backend ?? "fast-browser",
          repoRoot: options.repoRoot,
          outputDir,
        },
      })
      : endpoint
        ? await requestVisualEndpointSnapshot({
        ...endpoint,
        body: {
          projectPath: projectDir,
          compositionPath: parsed.compositionPath,
          timeMs: parsed.at,
          fps,
          width,
          height,
          format: "png",
          timeoutMs: parsed.timeoutMs,
          reason: "snapshot",
          intent: "specific-frame",
          preferredBackend: parsed.backend ?? "fast-browser",
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
    const frame = capture.frames[0]
    if (!frame) {
      throw new VisualCliError("SNAPSHOT_MISSING", "Visual snapshot did not return a frame.")
    }

    const payload = {
      ok: true,
      backend: capture.backend,
      fallbackFrom: capture.fallbackFrom ?? null,
      source: snapshotSource,
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
    const outputPayload = shouldUseCleanVisualContext(env)
      ? simplifySnapshotContextPayload({
        payload,
        compositionPath: parsed.compositionPath,
      })
      : payload

    return {
      exitCode: 0,
      stdout: parsed.json ? formatJson(outputPayload) : `Captured snapshot: ${payload.snapshot.path}\n`,
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
  let cleanVisualContext = false
  let cleanProjectDir: string | null = null
  try {
    const backendOption = extractOption(args, "--backend")
    const compositionOption = extractOption(backendOption.args, "--composition")
    const backend = backendOption.value ? parseBackend(backendOption.value) : null
    let forwardedArgs = compositionOption.args
            let reportedBackend: VisualContextBackendId = backend ?? "fast-browser"
    if (!args.includes("--help") && !args.includes("-h")) {
      const baseCwd = resolve(options.cwd ?? process.cwd())
      const projectDir = await projectDirFromArgs(forwardedArgs, baseCwd)
      const env = buildHyperframesEnvironment({
        ...process.env,
        ...(options.env ?? {}),
      }, { repoRoot: options.repoRoot })
      cleanVisualContext = shouldUseCleanVisualContext(env)
      cleanProjectDir = projectDir
      await assertWorkspaceBoundary({ projectDir, env })
    }

    const shouldUseServiceCapture = !options.captureFrames

    const result = await runFrameSheetCommand(forwardedArgs, {
      ...options,
      captureFrames: shouldUseServiceCapture
        ? async (input): Promise<FrameSheetCaptureResult> => {
          let service: ReturnType<typeof createVisualContextService> | null = null
          try {
            const metadata = await readVisualProjectMetadata(input.projectDir)
            const bridge = visualFileBridgeFromEnv(input.env)
            const endpoint = bridge ? null : visualEndpointFromEnv(input.env)
            const captureSize = selectFrameSheetCaptureSize({
              sourceWidth: metadata.width,
              sourceHeight: metadata.height,
              columns: input.columns,
              maxSheetWidth: input.maxSheetWidth,
            })
            const requestBody = {
              projectPath: input.projectDir,
              compositionPath: compositionOption.value,
              timestampsMs: input.timestampsMs,
              fps: metadata.fps ?? DEFAULT_FPS,
              width: captureSize.width,
              height: captureSize.height,
              format: "png" as const,
              timeoutMs: input.timeoutMs,
              reason: "frame-sheet" as const,
              intent: "frame-sheet" as const,
              preferredBackend: backend ?? "fast-browser",
              repoRoot: options.repoRoot,
            }
            const capture = bridge
              ? await requestVisualFileBridgeCapture({
                ...bridge,
                kind: "capture-frames",
                body: requestBody,
              })
              : endpoint
              ? await requestVisualEndpointFrames({
                ...endpoint,
                body: requestBody,
              })
              : await (service = createVisualContextService()).captureFrames(requestBody)
            reportedBackend = capture.backend
            return {
              framePaths: capture.frames.map((frame) => frame.path),
              cleanupPaths: capture.cleanupPaths,
            }
          } finally {
            await service?.shutdown()
          }
        }
        : options.captureFrames,
    })

    if (!wantsJson || result.exitCode !== 0) return result

    const payload = JSON.parse(result.stdout)
    const wrappedPayload = {
      ok: true,
      backend: reportedBackend,
      fallbackFrom: null,
      source: {
        kind: visualFileBridgeFromEnv(buildHyperframesEnvironment({
          ...process.env,
          ...(options.env ?? {}),
        }, { repoRoot: options.repoRoot })) || visualEndpointFromEnv(buildHyperframesEnvironment({
          ...process.env,
          ...(options.env ?? {}),
        }, { repoRoot: options.repoRoot }))
          ? "app-render"
          : "standalone-render",
        preEdit: false,
      },
      sheet: payload.sheet,
      elapsedMs: Math.round(performance.now() - startedAt),
      warnings: [],
    }
    const outputPayload = cleanVisualContext && cleanProjectDir
      ? simplifySheetContextPayload({
        payload: wrappedPayload,
        manifest: await readFrameSheetManifest(cleanProjectDir, wrappedPayload.sheet?.manifestPath),
        compositionPath: compositionOption.value ?? null,
      })
      : wrappedPayload
    return {
      exitCode: 0,
      stdout: formatJson(outputPayload),
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

function simplifySnapshotContextPayload(input: {
  payload: Record<string, any>
  compositionPath: string | null
}): Record<string, unknown> {
  return {
    ok: true,
    type: "snapshot",
    snapshot: input.payload.snapshot,
    context: {
      compositionPath: input.compositionPath,
      source: input.payload.source ?? null,
      samples: input.payload.snapshot?.sample ? [input.payload.snapshot.sample] : [],
    },
    elapsedMs: input.payload.elapsedMs,
  }
}

function simplifySheetContextPayload(input: {
  payload: Record<string, any>
  manifest: Record<string, any> | null
  compositionPath: string | null
}): Record<string, unknown> {
  return {
    ok: true,
    type: "sheet",
    sheet: input.payload.sheet,
    context: {
      compositionPath: input.compositionPath,
      source: input.payload.source ?? null,
      fps: input.manifest?.fps ?? null,
      rangeMs: input.manifest?.rangeMs ?? null,
      samples: input.manifest?.samples ?? [],
    },
    elapsedMs: input.payload.elapsedMs,
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
  if (subcommand === "sheet" || subcommand === "frame-sheet") {
    return runVisualSheetCommand(rest, options)
  }

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
