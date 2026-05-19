import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server } from "node:http"
import { realpath } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { isPathInsideDirectory } from "../../../shared/path-boundary"
import type {
  VisualCaptureFramesRequest,
  VisualCurrentFrameSnapshot,
  VisualContextIntentKind,
  VisualContextService,
  VisualSnapshotInput,
} from "./types"

export interface VisualContextEndpointOptions {
  service: VisualContextService
  workspaceRoot: string
  token?: string
  resolveCurrentFrameSnapshot?: (request: Record<string, unknown>) => Promise<VisualCurrentFrameSnapshot | null>
}

export interface VisualContextEndpointHandle {
  endpoint: string
  token: string
  workspaceRealPath: string
  close(): Promise<void>
}

class VisualContextEndpointError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "VisualContextEndpointError"
  }
}

function jsonResponse(
  response: import("node:http").ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(`${JSON.stringify(payload, null, 2)}\n`)
}

function tokenFromRequest(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length)
  const header = request.headers["x-ripple-visual-context-token"]
  return Array.isArray(header) ? header[0] ?? null : header ?? null
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ""
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1_000_000) {
      throw new VisualContextEndpointError(413, "REQUEST_TOO_LARGE", "Visual context request is too large.")
    }
  }
  const parsed = body ? JSON.parse(body) : {}
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new VisualContextEndpointError(400, "INVALID_JSON", "Visual context request body must be a JSON object.")
  }
  return parsed as Record<string, unknown>
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
    throw new VisualContextEndpointError(
      403,
      "WORKSPACE_MISMATCH",
      `${input.label} must stay inside the app-managed workspace.`,
    )
  }
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
      throw new VisualContextEndpointError(
        409,
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
    throw new VisualContextEndpointError(
      409,
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

function assertToken(input: {
  request: IncomingMessage
  token: string
}): void {
  if (tokenFromRequest(input.request) !== input.token) {
    throw new VisualContextEndpointError(
      401,
      "VISUAL_CONTEXT_UNAUTHORIZED",
      "Visual context request token was rejected.",
    )
  }
}

export async function createVisualContextEndpoint(
  options: VisualContextEndpointOptions,
): Promise<VisualContextEndpointHandle> {
  const token = options.token ?? randomBytes(24).toString("base64url")
  const workspaceRealPath = await realpath(options.workspaceRoot)

  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host && !request.headers.host.startsWith("127.0.0.1:")) {
        throw new VisualContextEndpointError(403, "INVALID_HOST", "Visual context endpoint only accepts local host headers.")
      }
      assertToken({ request, token })

      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname
      if (request.method === "GET" && path === "/health") {
        jsonResponse(response, 200, { ok: true })
        return
      }
      if (request.method !== "POST") {
        throw new VisualContextEndpointError(405, "METHOD_NOT_ALLOWED", "Visual context endpoint only accepts POST requests.")
      }

      const body = await readJsonBody(request)
      await assertRequestWorkspace({ workspaceRealPath, body })

      if (path === "/capture-frames") {
        const result = await options.service.captureFrames(framesInputFromBody(body))
        jsonResponse(response, 200, { ok: true, result })
        return
      }
      if (path === "/snapshot") {
        if (body.at === "current") {
          const current = await options.resolveCurrentFrameSnapshot?.(body)
          if (!current) {
            throw new VisualContextEndpointError(
              409,
              "CURRENT_FRAME_UNAVAILABLE",
              "Current-frame visual context requires a verified active preview identity.",
            )
          }
          await assertRequestWorkspace({
            workspaceRealPath,
            body: {
              projectPath: current.projectPath,
              sourcePath: current.sourcePath,
            },
          })
          await assertCurrentFrameMatchesRequest({ requested: body, current })
          const result = await options.service.captureSnapshot(snapshotInputFromCurrentFrame({
            requested: body,
            current,
          }))
          jsonResponse(response, 200, { ok: true, result })
          return
        }
        const result = await options.service.captureSnapshot(snapshotInputFromBody(body))
        jsonResponse(response, 200, { ok: true, result })
        return
      }

      throw new VisualContextEndpointError(404, "NOT_FOUND", "Visual context endpoint path was not found.")
    } catch (error) {
      const endpointError = error instanceof VisualContextEndpointError
        ? error
        : new VisualContextEndpointError(
          500,
          "VISUAL_CONTEXT_ENDPOINT_FAILED",
          error instanceof Error ? error.message : "Visual context endpoint failed.",
        )
      jsonResponse(response, endpointError.status, {
        ok: false,
        error: {
          code: endpointError.code,
          message: endpointError.message,
        },
      })
    }
  })

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    server.on("error", rejectPort)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address === "object" && address?.port) {
        resolvePort(address.port)
      } else {
        rejectPort(new Error("Failed to bind visual context endpoint."))
      }
    })
  })

  return {
    endpoint: `http://127.0.0.1:${port}`,
    token,
    workspaceRealPath,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose())
  })
}
