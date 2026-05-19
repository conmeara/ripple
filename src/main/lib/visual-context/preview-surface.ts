import type { Rectangle, Size } from "electron"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  VisualPreviewSurfaceBounds,
  VisualPreviewSurfaceUpdate,
} from "../../../shared/visual-preview-surface"
import type {
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
} from "./types"

export type { VisualPreviewSurfaceBounds, VisualPreviewSurfaceUpdate }

interface StoredVisualPreviewSurface extends VisualPreviewSurfaceUpdate {
  windowId: number
  updatedAt: number
}

interface CapturablePreviewWindow {
  isDestroyed(): boolean
  webContents: {
    capturePage(bounds: Rectangle): Promise<PreviewNativeImage>
  }
}

type ResolvePreviewWindow = (windowId: number) => Promise<CapturablePreviewWindow | null> | CapturablePreviewWindow | null

interface PreviewNativeImage {
  isEmpty(): boolean
  toPNG(): Buffer
  getSize(): Size
}

export interface VisualPreviewSurfaceCaptureProvider {
  captureCurrentFrame(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult>
}

const PREVIEW_SURFACE_MAX_AGE_MS = 15_000

function normalizeBounds(bounds: VisualPreviewSurfaceBounds): VisualPreviewSurfaceBounds {
  return {
    x: Math.max(0, Math.floor(bounds.x)),
    y: Math.max(0, Math.floor(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  }
}

function assertSingleCurrentFrameRequest(input: VisualCaptureFramesRequest): void {
  if (input.timestampsMs.length !== 1) {
    throw new Error("Live preview capture supports one current frame at a time.")
  }
  if (!input.previewSurfaceKey?.trim()) {
    throw new Error("Current-frame visual context requires a verified active preview identity.")
  }
}

function assertPreviewTimeMatches(input: VisualCaptureFramesRequest, surface: StoredVisualPreviewSurface): void {
  const expectedTimeMs = input.expectedPreviewTimeMs
  if (typeof expectedTimeMs !== "number" || !Number.isFinite(expectedTimeMs)) return
  if (typeof surface.timeMs !== "number" || !Number.isFinite(surface.timeMs)) {
    throw new Error("Current-frame visual context preview time is unavailable.")
  }
  const toleranceMs = Math.max(100, Math.ceil(1000 / Math.max(1, input.fps)))
  if (Math.abs(surface.timeMs - expectedTimeMs) > toleranceMs) {
    throw new Error("Current-frame visual context preview frame no longer matches the requested anchor.")
  }
}

export class VisualPreviewSurfaceRegistry implements VisualPreviewSurfaceCaptureProvider {
  private readonly surfaces = new Map<string, StoredVisualPreviewSurface>()

  constructor(
    private readonly resolveWindow: ResolvePreviewWindow = resolveElectronPreviewWindow,
  ) {}

  update(windowId: number, surface: VisualPreviewSurfaceUpdate): void {
    if (!surface.surfaceKey.trim()) return
    this.surfaces.set(surface.surfaceKey, {
      ...surface,
      bounds: normalizeBounds(surface.bounds),
      windowId,
      updatedAt: Date.now(),
    })
  }

  clear(input: { surfaceKey: string; windowId?: number | null }): void {
    const current = this.surfaces.get(input.surfaceKey)
    if (!current) return
    if (typeof input.windowId === "number" && current.windowId !== input.windowId) return
    this.surfaces.delete(input.surfaceKey)
  }

  clearWindow(windowId: number): void {
    for (const [surfaceKey, surface] of this.surfaces.entries()) {
      if (surface.windowId === windowId) this.surfaces.delete(surfaceKey)
    }
  }

  get(surfaceKey: string): StoredVisualPreviewSurface | null {
    return this.surfaces.get(surfaceKey) ?? null
  }

  async captureCurrentFrame(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    assertSingleCurrentFrameRequest(input)
    const startedAt = performance.now()
    const surface = this.get(input.previewSurfaceKey!)
    if (!surface) {
      throw new Error("Current-frame visual context requires a verified active preview identity.")
    }
    const warnings: string[] = []
    if (Date.now() - surface.updatedAt > PREVIEW_SURFACE_MAX_AGE_MS) {
      warnings.push("Current-frame visual context used the last known preview bounds because the preview heartbeat was stale.")
    }
    assertPreviewTimeMatches(input, surface)

    const window = await this.resolveWindow(surface.windowId)
    if (!window || window.isDestroyed()) {
      this.clear({ surfaceKey: surface.surfaceKey, windowId: surface.windowId })
      throw new Error("Current-frame visual context preview window is unavailable.")
    }

    const image = await window.webContents.capturePage(surface.bounds)
    if (image.isEmpty()) {
      throw new Error("Current-frame visual context captured an empty preview.")
    }

    const outputDir = input.outputDir ?? join(input.projectPath, ".ripple", "visual-context", "snapshots")
    await mkdir(outputDir, { recursive: true })
    const framePath = join(outputDir, "current.png")
    const png = image.toPNG()
    await writeFile(framePath, png)
    const frameInfo = await stat(framePath)
    const imageSize = image.getSize()
    const elapsedMs = performance.now() - startedAt

    return {
      backend: "preview",
      frames: [{
        index: 0,
        timeMs: input.timestampsMs[0],
        frame: Math.round((input.timestampsMs[0] / 1000) * input.fps),
        path: framePath,
        width: imageSize.width,
        height: imageSize.height,
        sizeBytes: frameInfo.size,
      }],
      elapsedMs,
      timings: {
        previewCaptureMs: elapsedMs,
      },
      warnings,
      cleanupPaths: [],
    }
  }
}

export const visualPreviewSurfaceRegistry = new VisualPreviewSurfaceRegistry()

async function resolveElectronPreviewWindow(windowId: number): Promise<CapturablePreviewWindow | null> {
  const electron = await import("electron") as typeof import("electron") & {
    default?: typeof import("electron")
  }
  const browserWindow = electron.BrowserWindow ?? electron.default?.BrowserWindow
  return browserWindow?.fromId(windowId) ?? null
}

export function createPreviewSurfaceVisualBackend(
  provider: VisualPreviewSurfaceCaptureProvider = visualPreviewSurfaceRegistry,
): VisualCaptureBackend {
  return {
    id: "preview",
    supportsWarmSession: true,
    captureFrames: (input) => provider.captureCurrentFrame(input),
  }
}
