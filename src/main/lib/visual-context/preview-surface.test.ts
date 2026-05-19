import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

let capturedBounds: { x: number; y: number; width: number; height: number } | null = null

describe("visual preview surface registry", () => {
  test("captures with a warning when the preview heartbeat is stale but the window is still available", async () => {
    const { VisualPreviewSurfaceRegistry } = await import("./preview-surface")
    const registry = new VisualPreviewSurfaceRegistry(() => ({
      isDestroyed: () => false,
      webContents: {
        capturePage: async (bounds) => {
          capturedBounds = bounds
          return {
            isEmpty: () => false,
            toPNG: () => ONE_BY_ONE_PNG,
            getSize: () => ({ width: bounds.width, height: bounds.height }),
          }
        },
      },
    }))
    const outputDir = await mkdtemp(join(tmpdir(), "ripple-preview-surface-"))
    const originalDateNow = Date.now

    try {
      Date.now = () => 1_000
      registry.update(42, {
        surfaceKey: "project:composition:main",
        projectId: "project",
        compositionId: "composition",
        projectPath: outputDir,
        sourcePath: outputDir,
        sourceWidth: 1280,
        sourceHeight: 720,
        timeMs: 0,
        frame: 0,
        bounds: { x: 12.4, y: 34.6, width: 640.2, height: 360.8 },
      })

      Date.now = () => 20_500
      const result = await registry.captureCurrentFrame({
        projectPath: outputDir,
        sourcePath: outputDir,
        timestampsMs: [0],
        fps: 30,
        width: 1280,
        height: 720,
        format: "png",
        timeoutMs: 5000,
        reason: "snapshot",
        outputDir,
        previewSurfaceKey: "project:composition:main",
        intent: "current-frame",
      })

      expect(result.backend).toBe("preview")
      expect(result.frames).toHaveLength(1)
      expect(result.warnings).toContain(
        "Current-frame visual context used the last known preview bounds because the preview heartbeat was stale.",
      )
      expect(capturedBounds).toEqual({ x: 12, y: 34, width: 640, height: 361 })
      await expect(stat(join(outputDir, "current.png"))).resolves.toBeTruthy()
    } finally {
      Date.now = originalDateNow
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  test("rejects preview capture when the heartbeat no longer matches the requested anchor", async () => {
    const { VisualPreviewSurfaceRegistry } = await import("./preview-surface")
    const registry = new VisualPreviewSurfaceRegistry(() => ({
      isDestroyed: () => false,
      webContents: {
        capturePage: async (bounds) => ({
          isEmpty: () => false,
          toPNG: () => ONE_BY_ONE_PNG,
          getSize: () => ({ width: bounds.width, height: bounds.height }),
        }),
      },
    }))
    const outputDir = await mkdtemp(join(tmpdir(), "ripple-preview-surface-"))

    try {
      registry.update(42, {
        surfaceKey: "project:composition:main",
        projectId: "project",
        compositionId: "composition",
        projectPath: outputDir,
        sourcePath: outputDir,
        sourceWidth: 1280,
        sourceHeight: 720,
        timeMs: 2_000,
        frame: 60,
        bounds: { x: 12, y: 34, width: 640, height: 360 },
      })

      await expect(registry.captureCurrentFrame({
        projectPath: outputDir,
        sourcePath: outputDir,
        timestampsMs: [500],
        expectedPreviewTimeMs: 500,
        fps: 30,
        width: 1280,
        height: 720,
        format: "png",
        timeoutMs: 5000,
        reason: "comment-frame",
        outputDir,
        previewSurfaceKey: "project:composition:main",
        intent: "current-frame",
      })).rejects.toThrow("preview frame no longer matches the requested anchor")
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
