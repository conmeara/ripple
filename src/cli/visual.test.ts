import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createVisualContextEndpoint } from "../main/lib/visual-context"
import type {
  VisualCaptureFramesRequest,
  VisualContextService,
  VisualSnapshotInput,
} from "../main/lib/visual-context"
import { runRippleCli } from "./ripple"
import { runVisualCommand } from "./visual"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

async function makeProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-cli-project-"))
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    name: "Visual CLI Test",
    entry: "index.html",
    fps: 24,
    width: 1280,
    height: 720,
    duration: 8,
  }))
  await writeFile(join(projectDir, "index.html"), "<!doctype html><body></body>")
  return projectDir
}

async function writeHandoffManifest(
  projectDir: string,
  options: { createdAt?: number } = {},
): Promise<string> {
  const handoffDir = join(projectDir, ".ripple", "agent-visual-context", "run-test")
  const sheetDir = join(projectDir, ".ripple", "frame-sheets", "fs_prepared")
  await mkdir(handoffDir, { recursive: true })
  await mkdir(sheetDir, { recursive: true })
  await writeFile(join(handoffDir, "snapshot.png"), ONE_BY_ONE_PNG)
  await writeFile(join(sheetDir, "sheet.png"), ONE_BY_ONE_PNG)
  await writeFile(join(sheetDir, "manifest.json"), `${JSON.stringify({
    version: 1,
    fps: 24,
    rangeMs: [0, 8000],
    samples: [
      { index: 0, timeMs: 0, frame: 0, path: ".ripple/frame-sheets/fs_prepared/frames/000.png" },
      { index: 1, timeMs: 8000, frame: 192, path: ".ripple/frame-sheets/fs_prepared/frames/001.png" },
    ],
  }, null, 2)}\n`)
  const manifestPath = join(handoffDir, "manifest.json")
  await writeFile(manifestPath, `${JSON.stringify({
    version: 1,
    createdAt: options.createdAt ?? Date.now(),
    projectPath: projectDir,
    sourcePath: projectDir,
    compositionPath: "index.html",
    snapshot: {
      path: ".ripple/agent-visual-context/run-test/snapshot.png",
      timeMs: 0,
      frame: 0,
      width: 1280,
      height: 720,
      backend: "fast-browser",
      elapsedMs: 4,
    },
    sheet: {
      id: "fs_prepared",
      path: ".ripple/frame-sheets/fs_prepared/sheet.png",
      manifestPath: ".ripple/frame-sheets/fs_prepared/manifest.json",
      sampleCount: 2,
      summary: "Frame sheet captured by Ripple.",
      backend: "fast-browser",
      elapsedMs: 7,
    },
  }, null, 2)}\n`)
  return manifestPath
}

describe("ripple visual CLI commands", () => {
  test("captures an explicit snapshot through the visual service contract", async () => {
    const projectDir = await makeProject()
    let capturedRepoRoot: string | null = null
    try {
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "1.25s",
        "--json",
      ], {
        idFactory: () => "snap_test",
        repoRoot: "/tmp/ripple-app",
        captureSnapshot: async (input) => {
          capturedRepoRoot = input.repoRoot ?? null
          const framePath = join(input.outputDir, "000.png")
          await writeFile(framePath, ONE_BY_ONE_PNG)
          return {
            backend: "engine",
            frames: [{
              index: 0,
              timeMs: input.timeMs,
              frame: Math.round((input.timeMs / 1000) * input.fps),
              path: framePath,
              width: input.width,
              height: input.height,
              sizeBytes: ONE_BY_ONE_PNG.length,
            }],
            elapsedMs: 12,
            timings: { captureMs: 12 },
            warnings: [],
            cleanupPaths: [],
          }
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.backend).toBe("engine")
      expect(payload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_test/000.png")
      expect(payload.snapshot.sample).toEqual({
        timeMs: 1250,
        frame: 30,
      })
      expect(payload.snapshot.width).toBe(1280)
      expect(payload.snapshot.height).toBe(720)
      expect(capturedRepoRoot).toBe("/tmp/ripple-app")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("delegates snapshots to the app visual context endpoint when provided", async () => {
    const projectDir = await makeProject()
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async () => {
        throw new Error("not used")
      },
      captureSnapshot: async (input: VisualSnapshotInput) => {
        const framePath = join(String(input.outputDir), "endpoint.png")
        await writeFile(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "engine",
          frames: [{
            index: 0,
            timeMs: input.timeMs,
            frame: Math.round((input.timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          }],
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [],
        }
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
    })

    try {
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "0.5s",
        "--json",
      ], {
        idFactory: () => "snap_endpoint",
        env: {
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.backend).toBe("engine")
      expect(payload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_endpoint/endpoint.png")
      expect(payload.snapshot.sample).toEqual({
        timeMs: 500,
        frame: 12,
      })
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("requires an app-backed endpoint for current-frame snapshots", async () => {
    const result = await runVisualCommand([
      "snapshot",
      "--at",
      "current",
      "--json",
    ])

    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).error.code).toBe("CURRENT_FRAME_REQUIRES_APP")
  })

  test("does not substitute prepared handoff files for current-frame snapshots", async () => {
    const projectDir = await makeProject()
    try {
      const handoffManifestPath = await writeHandoffManifest(projectDir)
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        env: {
          RIPPLE_VISUAL_CONTEXT_MANIFEST: handoffManifestPath,
        },
      })

      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).error.code).toBe("CURRENT_FRAME_REQUIRES_APP")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("surfaces endpoint current-frame rejection without standalone fallback", async () => {
    const projectDir = await makeProject()
    const handle = await createVisualContextEndpoint({
      service: {
        warmProject: async () => undefined,
        captureFrames: async () => {
          throw new Error("not used")
        },
        captureSnapshot: async () => {
          throw new Error("not used")
        },
        invalidateProject: async () => undefined,
        shutdown: async () => undefined,
      },
      workspaceRoot: projectDir,
      token: "token-test",
    })
    try {
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        env: {
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
        },
      })

      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).error.code).toBe("CURRENT_FRAME_UNAVAILABLE")
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("captures current-frame snapshots through the app visual context endpoint", async () => {
    const projectDir = await makeProject()
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async () => {
        throw new Error("not used")
      },
      captureSnapshot: async (input: VisualSnapshotInput) => {
        const framePath = join(String(input.outputDir), "current.png")
        await writeFile(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "engine",
          frames: [{
            index: 0,
            timeMs: input.timeMs,
            frame: Math.round((input.timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          }],
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [],
        }
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
      resolveCurrentFrameSnapshot: async () => ({
        projectPath: projectDir,
        compositionPath: "index.html",
        timeMs: 1500,
        fps: 24,
        width: 1280,
        height: 720,
      }),
    })
    try {
      const result = await runRippleCli([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        idFactory: () => "snap_current",
        env: {
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.backend).toBe("engine")
      expect(payload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_current/current.png")
      expect(payload.snapshot.sample).toEqual({
        timeMs: 1500,
        frame: 36,
      })
      expect(payload.snapshot.width).toBe(1280)
      expect(payload.snapshot.height).toBe(720)
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("prefers the live endpoint over prepared handoff files for current-frame snapshots", async () => {
    const projectDir = await makeProject()
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async () => {
        throw new Error("not used")
      },
      captureSnapshot: async (input: VisualSnapshotInput) => {
        const framePath = join(String(input.outputDir), "live-current.png")
        await writeFile(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "engine",
          frames: [{
            index: 0,
            timeMs: input.timeMs,
            frame: Math.round((input.timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          }],
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [],
        }
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
      resolveCurrentFrameSnapshot: async () => ({
        projectPath: projectDir,
        compositionPath: "index.html",
        timeMs: 2500,
        fps: 24,
        width: 1280,
        height: 720,
      }),
    })
    try {
      const handoffManifestPath = await writeHandoffManifest(projectDir)
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        env: {
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
          RIPPLE_VISUAL_CONTEXT_MANIFEST: handoffManifestPath,
        },
        idFactory: () => "snap_live_current",
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_live_current/live-current.png")
      expect(payload.snapshot.sample).toEqual({ timeMs: 2500, frame: 60 })
      expect(payload.source.kind).toBe("live-app")
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("uses the app-prepared file handoff when the localhost endpoint is unreachable", async () => {
    const projectDir = await makeProject()
    try {
      const handoffManifestPath = await writeHandoffManifest(projectDir)
      const env = {
        RIPPLE_VISUAL_CONTEXT_ENDPOINT: "http://127.0.0.1:9",
        RIPPLE_VISUAL_CONTEXT_TOKEN: "dead-endpoint",
        RIPPLE_VISUAL_CONTEXT_MANIFEST: handoffManifestPath,
      }

      const snapshot = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "0s",
        "--composition",
        "index.html",
        "--backend",
        "engine",
        "--json",
      ], {
        env,
        idFactory: () => "snap_handoff",
      })

      expect(snapshot.exitCode).toBe(0)
      const snapshotPayload = JSON.parse(snapshot.stdout)
      expect(snapshotPayload.backend).toBe("fast-browser")
      expect(snapshotPayload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_handoff/current.png")
      expect(snapshotPayload.snapshot.sample).toEqual({ timeMs: 0, frame: 0 })
      expect(snapshotPayload.warnings[0]).toContain("prepared app visual context")

      const sheet = await runVisualCommand([
        "frame-sheet",
        "--dir",
        projectDir,
        "--range",
        "0s..8s",
        "--samples",
        "8",
        "--columns",
        "4",
        "--backend",
        "engine",
        "--json",
      ], { env })

      expect(sheet.exitCode).toBe(0)
      const sheetPayload = JSON.parse(sheet.stdout)
      expect(sheetPayload.backend).toBe("fast-browser")
      expect(sheetPayload.fallbackFrom).toBe("visual-context-handoff")
      expect(sheetPayload.sheet.path).toBe(".ripple/frame-sheets/fs_prepared/sheet.png")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("ignores prepared snapshot handoff after source files change", async () => {
    const projectDir = await makeProject()
    try {
      const handoffManifestPath = await writeHandoffManifest(projectDir, {
        createdAt: Date.now() - 10_000,
      })
      const result = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "0s",
        "--composition",
        "index.html",
        "--json",
      ], {
        env: {
          RIPPLE_VISUAL_CONTEXT_MANIFEST: handoffManifestPath,
        },
        idFactory: () => "snap_fresh_after_edit",
        captureSnapshot: async (input) => {
          const framePath = join(String(input.outputDir), "fresh.png")
          await writeFile(framePath, ONE_BY_ONE_PNG)
          return {
            backend: "engine",
            frames: [{
              index: 0,
              timeMs: input.timeMs,
              frame: 0,
              path: framePath,
              width: input.width,
              height: input.height,
              sizeBytes: ONE_BY_ONE_PNG.length,
            }],
            elapsedMs: 4,
            timings: {},
            warnings: [],
            cleanupPaths: [],
          }
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.snapshot.path).toBe(".ripple/visual-context/snapshots/snap_fresh_after_edit/fresh.png")
      expect(payload.source.kind).toBe("standalone-render")
      expect(payload.warnings).toEqual([])
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("cleans direct visual commands inside app-managed agent runs", async () => {
    const projectDir = await makeProject()
    try {
      const handoffManifestPath = await writeHandoffManifest(projectDir)
      const env = {
        RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
        RIPPLE_VISUAL_CONTEXT_ENDPOINT: "http://127.0.0.1:9",
        RIPPLE_VISUAL_CONTEXT_TOKEN: "dead-endpoint",
        RIPPLE_VISUAL_CONTEXT_MANIFEST: handoffManifestPath,
      }

      const snapshot = await runVisualCommand([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "0s",
        "--composition",
        "index.html",
        "--json",
      ], {
        env,
        idFactory: () => "snap_legacy_clean",
      })

      expect(snapshot.exitCode).toBe(0)
      const snapshotPayload = JSON.parse(snapshot.stdout)
      expect(snapshotPayload).toEqual({
        ok: true,
        type: "snapshot",
        snapshot: {
          id: "snap_legacy_clean",
          path: ".ripple/visual-context/snapshots/snap_legacy_clean/current.png",
          sample: { timeMs: 0, frame: 0 },
          width: 1280,
          height: 720,
        },
        context: {
          compositionPath: "index.html",
          source: {
            kind: "prepared-context",
            createdAt: expect.any(Number),
            preEdit: true,
          },
          samples: [{ timeMs: 0, frame: 0 }],
        },
        elapsedMs: expect.any(Number),
      })
      expect(snapshot.stdout).not.toContain("backend")
      expect(snapshot.stdout).not.toContain("endpoint")
      expect(snapshot.stdout).not.toContain("fallback")

      const sheet = await runVisualCommand([
        "frame-sheet",
        "--dir",
        projectDir,
        "--range",
        "0s..8s",
        "--samples",
        "8",
        "--columns",
        "4",
        "--json",
      ], { env })

      expect(sheet.exitCode).toBe(0)
      const sheetPayload = JSON.parse(sheet.stdout)
      expect(sheetPayload.ok).toBe(true)
      expect(sheetPayload.type).toBe("sheet")
      expect(sheetPayload.sheet.path).toBe(".ripple/frame-sheets/fs_prepared/sheet.png")
      expect(sheetPayload.context.compositionPath).toBe("index.html")
      expect(sheetPayload.context.source).toEqual({
        kind: "prepared-context",
        createdAt: expect.any(Number),
        manifestPath: ".ripple/frame-sheets/fs_prepared/manifest.json",
        preEdit: true,
      })
      expect(sheetPayload.context.samples).toHaveLength(2)
      expect(sheet.stdout).not.toContain("backend")
      expect(sheet.stdout).not.toContain("endpoint")
      expect(sheet.stdout).not.toContain("fallback")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("captures the current app frame through the snapshot command", async () => {
    const projectDir = await makeProject()
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async () => {
        throw new Error("not used")
      },
      captureSnapshot: async (input: VisualSnapshotInput) => {
        const framePath = join(String(input.outputDir), "context-current.png")
        await writeFile(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "engine",
          frames: [{
            index: 0,
            timeMs: input.timeMs,
            frame: Math.round((input.timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          }],
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [],
        }
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
      resolveCurrentFrameSnapshot: async () => ({
        projectPath: projectDir,
        compositionPath: "index.html",
        timeMs: 1500,
        fps: 24,
        width: 1280,
        height: 720,
      }),
    })
    try {
      const result = await runRippleCli([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        idFactory: () => "snap_context_current",
        env: {
          RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload).toEqual({
        ok: true,
        type: "snapshot",
        snapshot: {
          id: "snap_context_current",
          path: ".ripple/visual-context/snapshots/snap_context_current/context-current.png",
          sample: {
            timeMs: 1500,
            frame: 36,
          },
          width: 1280,
          height: 720,
        },
        context: {
          compositionPath: null,
          source: { kind: "live-app", preEdit: false },
          samples: [{ timeMs: 1500, frame: 36 }],
        },
        elapsedMs: expect.any(Number),
      })
      expect(result.stdout).not.toContain("backend")
      expect(result.stdout).not.toContain("endpoint")
      expect(result.stdout).not.toContain("handoff")
      expect(result.stdout).not.toContain("fallback")
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("wraps frame-sheet JSON for the future-facing frame-sheet command", async () => {
    const projectDir = await makeProject()
    try {
      const result = await runVisualCommand([
        "frame-sheet",
        "--dir",
        projectDir,
        "--at",
        "0s,1s",
        "--columns",
        "2",
        "--json",
      ], {
        idFactory: () => "fs_visual",
        captureFrames: async ({ timestampsMs }) => {
          const framePaths: string[] = []
          for (const [index] of timestampsMs.entries()) {
            const framePath = join(projectDir, `visual-sheet-${index}.png`)
            await writeFile(framePath, ONE_BY_ONE_PNG)
            framePaths.push(framePath)
          }
          return { framePaths, cleanupPaths: framePaths }
        },
        assembleSheet: async ({ outputPath }) => {
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.backend).toBe("engine")
      expect(payload.sheet.path).toBe(".ripple/frame-sheets/fs_visual/sheet.png")
      expect(payload.sheet.manifestPath).toBe(".ripple/frame-sheets/fs_visual/manifest.json")
      expect(payload.elapsedMs).toBeGreaterThanOrEqual(0)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("returns structured sheet errors before frame-sheet parsing", async () => {
    const jsonResult = await runVisualCommand([
      "frame-sheet",
      "--backend",
      "bogus",
      "--json",
    ])

    expect(jsonResult.exitCode).toBe(1)
    expect(jsonResult.stderr).toBe("")
    expect(JSON.parse(jsonResult.stdout).error.code).toBe("INVALID_BACKEND")

    const textResult = await runVisualCommand([
      "frame-sheet",
      "--backend",
    ])
    expect(textResult.exitCode).toBe(1)
    expect(textResult.stdout).toBe("")
    expect(textResult.stderr).toContain("--backend requires a value.")
  })

  test("delegates sheet frame capture to the app endpoint when provided", async () => {
    const projectDir = await makeProject()
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async (input: VisualCaptureFramesRequest) => {
        const frameDir = join(input.projectPath, ".ripple", "endpoint-sheet-frames")
        await mkdir(frameDir, { recursive: true })
        const frames = []
        for (const [index, timeMs] of input.timestampsMs.entries()) {
          const framePath = join(frameDir, `${index}.png`)
          await writeFile(framePath, ONE_BY_ONE_PNG)
          frames.push({
            index,
            timeMs,
            frame: Math.round((timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          })
        }
        return {
          backend: "engine",
          frames,
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [frameDir],
        }
      },
      captureSnapshot: async () => {
        throw new Error("not used")
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
    })

    try {
      const result = await runVisualCommand([
        "frame-sheet",
        "--dir",
        projectDir,
        "--at",
        "0s,1s",
        "--columns",
        "2",
        "--json",
      ], {
        idFactory: () => "fs_endpoint",
        env: {
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: handle.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: handle.token,
        },
        assembleSheet: async ({ outputPath }) => {
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.backend).toBe("engine")
      expect(payload.sheet.path).toBe(".ripple/frame-sheets/fs_endpoint/sheet.png")
    } finally {
      await handle.close()
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("returns modest context metadata from the generated frame-sheet manifest in app-managed runs", async () => {
    const projectDir = await makeProject()
    try {
      const result = await runVisualCommand([
        "frame-sheet",
        "--dir",
        projectDir,
        "--range",
        "0s..2s",
        "--samples",
        "3",
        "--columns",
        "3",
        "--composition",
        "index.html",
        "--json",
      ], {
        env: {
          RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
        },
        idFactory: () => "fs_context",
        captureFrames: async ({ timestampsMs }) => {
          await mkdir(projectDir, { recursive: true })
          const framePaths: string[] = []
          for (const [index] of timestampsMs.entries()) {
            const framePath = join(projectDir, `context-sheet-${index}.png`)
            await writeFile(framePath, ONE_BY_ONE_PNG)
            framePaths.push(framePath)
          }
          return { framePaths, cleanupPaths: framePaths }
        },
        assembleSheet: async ({ outputPath }) => {
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.type).toBe("sheet")
      expect(payload.context.compositionPath).toBe("index.html")
      expect(payload.context.fps).toBe(24)
      expect(payload.context.rangeMs).toEqual([0, 2000])
      expect(payload.context.samples.map((sample: any) => sample.timeMs)).toEqual([
        0,
        1000,
        2000,
      ])
      const manifest = JSON.parse(
        await readFile(join(projectDir, payload.sheet.manifestPath), "utf8"),
      )
      expect(manifest.samples).toHaveLength(3)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("is reachable through the top-level ripple command", async () => {
    const result = await runRippleCli(["--help"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("snapshot")
    expect(result.stdout).toContain("frame-sheet")
    expect(result.stdout).not.toContain("context")
    expect(result.stdout).not.toContain("\n  sheet")
  })

  test("routes top-level snapshot commands directly", async () => {
    const result = await runRippleCli(["snapshot", "--help"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Usage: ripple snapshot")
  })

  test("does not route the removed combined visual command", async () => {
    const result = await runRippleCli(["context", "--help"])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Unknown ripple command: context")
  })

  test("keeps legacy grouped visual and hidden sheet commands as compatibility aliases", async () => {
    const visualResult = await runRippleCli(["visual", "frame-sheet", "--help"])
    const sheetResult = await runRippleCli(["sheet", "--help"])
    const frameSheetResult = await runRippleCli(["frame-sheet", "--help"])

    expect(visualResult.exitCode).toBe(0)
    expect(visualResult.stdout).toContain("Usage: ripple frame-sheet")
    expect(sheetResult.exitCode).toBe(0)
    expect(sheetResult.stdout).toContain("Usage: ripple frame-sheet")
    expect(frameSheetResult.exitCode).toBe(0)
    expect(frameSheetResult.stdout).toContain("Usage: ripple frame-sheet")
  })
})
