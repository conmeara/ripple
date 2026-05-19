import { randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { setInterval, clearInterval } from "node:timers"
import { isPathInsideDirectory } from "../../../shared/path-boundary"
import type {
  VisualCaptureFramesRequest,
  VisualCurrentFrameSnapshot,
  VisualContextIntentKind,
  VisualContextService,
  VisualSnapshotInput,
} from "./types"

export const VISUAL_CONTEXT_FILE_BRIDGE_VERSION = 1

export interface VisualContextFileBridgeOptions {
  service: VisualContextService
  workspaceRoot: string
  requestDir: string
  token?: string
  pollIntervalMs?: number
  resolveCurrentFrameSnapshot?: (request: Record<string, unknown>) => Promise<VisualCurrentFrameSnapshot | null>
}

export interface VisualContextFileBridgeHandle {
  requestDir: string
  token: string
  workspaceRealPath: string
  close(): Promise<void>
}

class VisualContextFileBridgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "VisualContextFileBridgeError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key]
  return typeof value === "string" && value.trim() ? value : null
}

function numberField(body: Record<string, unknown>, key: string): number | null {
  const value = body[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function intentField(body: Record<string, unknown>): VisualContextIntentKind | null {
  const value = body.intent
  return value === "current-frame" || value === "specific-frame" || value === "frame-sheet"
    ? value
    : null
}

async function realpathExistingParent(path: string): Promise<string> {
  let current = dirname(path)
  while (current && current !== dirname(current)) {
    try {
      return await realpath(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      current = dirname(current)
    }
  }
  return realpath(current)
}

async function assertWorkspaceScopedPath(input: {
  workspaceRealPath: string
  path: string | null
  label: string
  allowMissing?: boolean
}): Promise<void> {
  if (!input.path) return
  const targetPath = resolve(input.path)
  let targetRealPath: string
  try {
    targetRealPath = await realpath(targetPath)
  } catch (error) {
    if (!input.allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
    targetRealPath = await realpathExistingParent(targetPath)
  }
  if (!isPathInsideDirectory(input.workspaceRealPath, targetRealPath)) {
    throw new VisualContextFileBridgeError(
      "WORKSPACE_MISMATCH",
      `${input.label} must stay inside the app-managed workspace.`,
    )
  }
}

async function assertRequestWorkspace(input: {
  workspaceRealPath: string
  body: Record<string, unknown>
}): Promise<void> {
  await assertWorkspaceScopedPath({
    workspaceRealPath: input.workspaceRealPath,
    path: stringField(input.body, "projectPath"),
    label: "projectPath",
  })
  await assertWorkspaceScopedPath({
    workspaceRealPath: input.workspaceRealPath,
    path: stringField(input.body, "sourcePath"),
    label: "sourcePath",
  })
  await assertWorkspaceScopedPath({
    workspaceRealPath: input.workspaceRealPath,
    path: stringField(input.body, "outputDir"),
    label: "outputDir",
    allowMissing: true,
  })
}

async function assertCurrentFrameMatchesRequest(input: {
  requested: Record<string, unknown>
  current: VisualCurrentFrameSnapshot
}): Promise<void> {
  const requestedProjectPath = stringField(input.requested, "projectPath")
  if (requestedProjectPath) {
    const [requestedRealPath, currentRealPath] = await Promise.all([
      realpath(resolve(requestedProjectPath)),
      realpath(resolve(input.current.projectPath)),
    ])
    if (requestedRealPath !== currentRealPath) {
      throw new VisualContextFileBridgeError(
        "CURRENT_FRAME_MISMATCH",
        "Current-frame visual context does not match the requested project.",
      )
    }
  }

  const requestedCompositionPath = stringField(input.requested, "compositionPath")
  if (
    requestedCompositionPath &&
    input.current.compositionPath &&
    requestedCompositionPath !== input.current.compositionPath
  ) {
    throw new VisualContextFileBridgeError(
      "CURRENT_FRAME_MISMATCH",
      "Current-frame visual context does not match the requested composition.",
    )
  }
}

function snapshotInputFromCurrentFrame(input: {
  requested: Record<string, unknown>
  current: VisualCurrentFrameSnapshot
}): VisualSnapshotInput {
  return {
    projectPath: input.current.projectPath,
    sourcePath: input.current.sourcePath ?? stringField(input.requested, "sourcePath"),
    projectId: input.current.projectId ?? stringField(input.requested, "projectId"),
    compositionId: input.current.compositionId ?? stringField(input.requested, "compositionId"),
    compositionPath: input.current.compositionPath ?? stringField(input.requested, "compositionPath"),
    sourceRevisionId: input.current.sourceRevisionId ?? stringField(input.requested, "sourceRevisionId"),
    previewSurfaceKey: input.current.previewSurfaceKey ?? stringField(input.requested, "previewSurfaceKey"),
    timeMs: input.current.timeMs,
    fps: input.current.fps ?? numberField(input.requested, "fps") ?? 30,
    width: input.current.width ?? numberField(input.requested, "width") ?? 1920,
    height: input.current.height ?? numberField(input.requested, "height") ?? 1080,
    format: input.requested.format === "jpeg" || input.requested.format === "webp"
      ? input.requested.format
      : "png",
    timeoutMs: numberField(input.requested, "timeoutMs") ?? 5000,
    reason: "snapshot",
    outputDir: stringField(input.requested, "outputDir") ?? undefined,
    repoRoot: stringField(input.requested, "repoRoot") ?? undefined,
    env: undefined,
    intent: "current-frame",
    preferredBackend: "preview",
  }
}

function framesInputFromBody(body: Record<string, unknown>): VisualCaptureFramesRequest {
  return {
    ...(body as unknown as VisualCaptureFramesRequest),
    intent: intentField(body) ?? (
      body.reason === "frame-sheet" ? "frame-sheet" : undefined
    ),
  }
}

function snapshotInputFromBody(body: Record<string, unknown>): VisualSnapshotInput {
  return {
    ...(body as unknown as VisualSnapshotInput),
    intent: intentField(body) ?? "specific-frame",
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function responsePathForRequest(requestPath: string): string {
  return requestPath.replace(/\.request\.json$/, ".response.json")
}

async function responseExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function handleBridgeRequest(input: {
  request: Record<string, unknown>
  token: string
  workspaceRealPath: string
  service: VisualContextService
  resolveCurrentFrameSnapshot?: (request: Record<string, unknown>) => Promise<VisualCurrentFrameSnapshot | null>
}): Promise<unknown> {
  if (input.request.version !== VISUAL_CONTEXT_FILE_BRIDGE_VERSION) {
    throw new VisualContextFileBridgeError(
      "VISUAL_CONTEXT_BRIDGE_VERSION_MISMATCH",
      "Visual context bridge request version is not supported.",
    )
  }
  if (input.request.token !== input.token) {
    throw new VisualContextFileBridgeError(
      "VISUAL_CONTEXT_UNAUTHORIZED",
      "Visual context request token was rejected.",
    )
  }
  if (input.request.kind !== "snapshot" && input.request.kind !== "capture-frames") {
    throw new VisualContextFileBridgeError(
      "VISUAL_CONTEXT_BRIDGE_KIND_INVALID",
      "Visual context bridge request kind is not supported.",
    )
  }
  if (!isRecord(input.request.body)) {
    throw new VisualContextFileBridgeError(
      "INVALID_JSON",
      "Visual context bridge request body must be a JSON object.",
    )
  }

  const body = input.request.body
  await assertRequestWorkspace({ workspaceRealPath: input.workspaceRealPath, body })

  if (input.request.kind === "capture-frames") {
    return input.service.captureFrames(framesInputFromBody(body))
  }

  if (body.at === "current") {
    const current = await input.resolveCurrentFrameSnapshot?.(body)
    if (!current) {
      throw new VisualContextFileBridgeError(
        "CURRENT_FRAME_UNAVAILABLE",
        "Current-frame visual context requires a verified active preview identity.",
      )
    }
    await assertRequestWorkspace({
      workspaceRealPath: input.workspaceRealPath,
      body: {
        projectPath: current.projectPath,
        sourcePath: current.sourcePath,
      },
    })
    await assertCurrentFrameMatchesRequest({ requested: body, current })
    return input.service.captureSnapshot(snapshotInputFromCurrentFrame({ requested: body, current }))
  }

  return input.service.captureSnapshot(snapshotInputFromBody(body))
}

export async function createVisualContextFileBridge(
  options: VisualContextFileBridgeOptions,
): Promise<VisualContextFileBridgeHandle> {
  const token = options.token ?? randomBytes(24).toString("base64url")
  const workspaceRealPath = await realpath(options.workspaceRoot)
  const requestDir = resolve(options.requestDir)
  await mkdir(requestDir, { recursive: true })
  await assertWorkspaceScopedPath({
    workspaceRealPath,
    path: requestDir,
    label: "requestDir",
  })

  let closed = false
  let processing = false
  const processPending = async () => {
    if (closed || processing) return
    processing = true
    try {
      const entries = await readdir(requestDir).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
      })
      for (const entry of entries) {
        if (!/^[a-zA-Z0-9_-]+\.request\.json$/.test(entry)) continue
        const requestPath = join(requestDir, entry)
        const responsePath = responsePathForRequest(requestPath)
        if (await responseExists(responsePath)) continue
        try {
          const parsed = JSON.parse(await readFile(requestPath, "utf8"))
          if (!isRecord(parsed)) {
            throw new VisualContextFileBridgeError(
              "INVALID_JSON",
              "Visual context bridge request must be a JSON object.",
            )
          }
          const result = await handleBridgeRequest({
            request: parsed,
            token,
            workspaceRealPath,
            service: options.service,
            resolveCurrentFrameSnapshot: options.resolveCurrentFrameSnapshot,
          })
          await writeJson(responsePath, { ok: true, result })
        } catch (error) {
          const bridgeError = error instanceof VisualContextFileBridgeError
            ? error
            : new VisualContextFileBridgeError(
              "VISUAL_CONTEXT_BRIDGE_FAILED",
              error instanceof Error ? error.message : "Visual context bridge failed.",
            )
          await writeJson(responsePath, {
            ok: false,
            error: {
              code: bridgeError.code,
              message: bridgeError.message,
            },
          })
        }
      }
    } finally {
      processing = false
    }
  }

  const interval = setInterval(() => {
    void processPending()
  }, options.pollIntervalMs ?? 50)
  void processPending()

  return {
    requestDir,
    token,
    workspaceRealPath,
    close: async () => {
      closed = true
      clearInterval(interval)
      while (processing) {
        await new Promise((resolveClose) => setTimeout(resolveClose, 5))
      }
    },
  }
}
