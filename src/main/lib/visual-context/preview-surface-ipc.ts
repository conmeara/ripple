import { BrowserWindow, ipcMain } from "electron"
import {
  visualPreviewSurfaceRegistry,
  type VisualPreviewSurfaceUpdate,
} from "./preview-surface"

const UPDATE_CHANNEL = "visual-context:update-preview-surface"
const CLEAR_CHANNEL = "visual-context:clear-preview-surface"

let registered = false

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
    sourceWidth: numberField(value, "sourceWidth"),
    sourceHeight: numberField(value, "sourceHeight"),
    bounds: { x, y, width, height },
  }
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
    visualPreviewSurfaceRegistry.update(window.id, normalizePreviewSurfaceUpdate(value))
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
