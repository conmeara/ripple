import { BrowserWindow, ipcMain } from "electron"
import { eq } from "drizzle-orm"
import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import {
  visualPreviewSurfaceRegistry,
  type VisualPreviewSurfaceUpdate,
} from "./preview-surface"
import { createVisualContextService } from "./service"
import { HyperframesEngineVisualBackend } from "./backends/hyperframes-engine"
import {
  chats,
  compositions,
  getDatabase,
  projects,
  revisions,
} from "../db"

const UPDATE_CHANNEL = "visual-context:update-preview-surface"
const CLEAR_CHANNEL = "visual-context:clear-preview-surface"
const PREWARM_INTERVAL_MS = 30_000

let registered = false
const prewarmService = createVisualContextService({
  backendOrder: ["engine"],
  backends: {
    engine: new HyperframesEngineVisualBackend(),
  },
})
const lastPrewarmByKey = new Map<string, number>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function nullableStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function positiveDimension(value: number | null, fallback: number): number {
  if (value === null || value <= 0) return fallback
  return Math.min(7680, Math.max(1, Math.round(value)))
}

function normalizePreviewSurfaceUpdate(value: unknown): VisualPreviewSurfaceUpdate {
  if (!isRecord(value)) {
    throw new Error("Preview surface update must be an object.")
  }
  const bounds = isRecord(value.bounds) ? value.bounds : null
  const surfaceKey = stringField(value, "surfaceKey")
  const projectId = stringField(value, "projectId")
  const x = bounds ? numberField(bounds, "x") : null
  const y = bounds ? numberField(bounds, "y") : null
  const width = bounds ? numberField(bounds, "width") : null
  const height = bounds ? numberField(bounds, "height") : null
  if (!surfaceKey || !projectId || x === null || y === null || width === null || height === null) {
    throw new Error("Preview surface update is missing a verified identity or bounds.")
  }
  return {
    surfaceKey,
    projectId,
    compositionId: nullableStringField(value, "compositionId"),
    revisionId: nullableStringField(value, "revisionId"),
    chatId: nullableStringField(value, "chatId"),
    projectPath: nullableStringField(value, "projectPath"),
    sourcePath: nullableStringField(value, "sourcePath"),
    compositionPath: nullableStringField(value, "compositionPath"),
    sourceWidth: numberField(value, "sourceWidth"),
    sourceHeight: numberField(value, "sourceHeight"),
    timeMs: numberField(value, "timeMs"),
    frame: numberField(value, "frame"),
    bounds: { x, y, width, height },
  }
}

function prewarmKey(input: {
  projectPath: string
  sourcePath: string
  compositionPath?: string | null
  sourceRevisionId?: string | null
  width: number
  height: number
}): string {
  return [
    input.projectPath,
    input.sourcePath,
    input.compositionPath ?? "",
    input.sourceRevisionId ?? "",
    input.width,
    input.height,
  ].join("\u0000")
}

async function existingRealPath(path: string): Promise<string | null> {
  try {
    return await realpath(path)
  } catch {
    return null
  }
}

async function trustedPrewarmRequest(surface: VisualPreviewSurfaceUpdate): Promise<{
  projectPath: string
  sourcePath: string
  compositionPath: string | null
  sourceRevisionId: string | null
  width: number
  height: number
} | null> {
  const db = getDatabase()
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, surface.projectId))
    .get()
  if (!project || project.archivedAt) return null

  const projectPath = resolve(project.localPath || project.path)
  let sourcePath = projectPath
  let sourceRevisionId: string | null = null
  if (surface.revisionId) {
    const revision = db
      .select()
      .from(revisions)
      .where(eq(revisions.id, surface.revisionId))
      .get()
    if (!revision || revision.projectId !== project.id || !revision.contextPath) return null
    sourcePath = resolve(revision.contextPath)
    sourceRevisionId = revision.id
  } else if (surface.chatId) {
    const chat = db
      .select()
      .from(chats)
      .where(eq(chats.id, surface.chatId))
      .get()
    if (!chat || chat.projectId !== project.id || chat.archivedAt) return null
    sourcePath = chat.worktreePath ? resolve(chat.worktreePath) : projectPath
  }

  const composition = surface.compositionId
    ? db
      .select()
      .from(compositions)
      .where(eq(compositions.id, surface.compositionId))
      .get()
    : null
  if (surface.compositionId && (!composition || composition.projectId !== project.id)) {
    return null
  }

  const [projectRealPath, sourceRealPath] = await Promise.all([
    existingRealPath(projectPath),
    existingRealPath(sourcePath),
  ])
  if (!projectRealPath || !sourceRealPath) return null

  return {
    projectPath: projectRealPath,
    sourcePath: sourceRealPath,
    compositionPath: composition?.filePath ?? null,
    sourceRevisionId,
    width: positiveDimension(composition?.width ?? surface.sourceWidth ?? null, 1920),
    height: positiveDimension(composition?.height ?? surface.sourceHeight ?? null, 1080),
  }
}

function maybePrewarmVisualContext(surface: VisualPreviewSurfaceUpdate): void {
  void trustedPrewarmRequest(surface)
    .then((request) => {
      if (!request) return
      const key = prewarmKey(request)
      const now = Date.now()
      const lastPrewarmAt = lastPrewarmByKey.get(key) ?? 0
      if (now - lastPrewarmAt < PREWARM_INTERVAL_MS) return
      lastPrewarmByKey.set(key, now)

      return prewarmService.warmProject({
        projectPath: request.projectPath,
        sourcePath: request.sourcePath,
        compositionPath: request.compositionPath,
        sourceRevisionId: request.sourceRevisionId,
        fps: 30,
        width: request.width,
        height: request.height,
        format: "png",
      })
    })
    .catch((error) => {
      console.warn("[Ripple] Visual context prewarm failed:", error)
    })
}

function getWindowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window && !window.isDestroyed() ? window : null
}

export function registerVisualPreviewSurfaceIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(UPDATE_CHANNEL, (event, value: unknown) => {
    const window = getWindowFromEvent(event)
    if (!window) return { ok: false }
    const surface = normalizePreviewSurfaceUpdate(value)
    visualPreviewSurfaceRegistry.update(window.id, surface)
    maybePrewarmVisualContext(surface)
    return { ok: true }
  })

  ipcMain.handle(CLEAR_CHANNEL, (event, value: unknown) => {
    const window = getWindowFromEvent(event)
    if (!window || !isRecord(value)) return { ok: false }
    const surfaceKey = stringField(value, "surfaceKey")
    if (surfaceKey) {
      visualPreviewSurfaceRegistry.clear({ surfaceKey, windowId: window.id })
    }
    return { ok: true }
  })
}

export function clearVisualPreviewSurfacesForWindow(windowId: number): void {
  visualPreviewSurfaceRegistry.clearWindow(windowId)
}
