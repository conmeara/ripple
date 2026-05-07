import { describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { getVisualCaptureBackend } from "../backend-registry"
import { resolveProducerBrowserPath } from "../../hyperframes/runtime"
import { HyperframesEngineVisualBackend } from "./hyperframes-engine"

const repoRoot = process.cwd()
const qaFixtureRoot = resolve(repoRoot, "test", "fixtures", "hyperframes", "visual-capture-qa")
const timedTest = test as unknown as (
  name: string,
  fn: () => unknown | Promise<unknown>,
  timeout: number,
) => void

function shouldSkipBrowserQa(): boolean {
  return !resolveProducerBrowserPath(repoRoot)
}

async function makeQaProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-engine-backend-"))
  await cp(qaFixtureRoot, projectDir, { recursive: true })
  return projectDir
}

async function cleanupProject(projectDir: string | null, cleanupPaths: string[] = []): Promise<void> {
  await Promise.all(cleanupPaths.map((path) =>
    rm(path, { recursive: true, force: true }).catch(() => undefined)
  ))
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function makeNonEntryProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-engine-non-entry-"))
  await mkdir(join(projectDir, "compositions"), { recursive: true })
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
    width: 320,
    height: 180,
    fps: 30,
  }))
  await writeFile(join(projectDir, "index.html"), "<!doctype html><title>Entry without capture hooks</title>")
  await writeFile(join(projectDir, "compositions", "alternate.html"), `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #264653; }
      main { width: 320px; height: 180px; background: #2a9d8f; }
    </style>
  </head>
  <body>
    <main data-composition-id="alternate"></main>
    <script>
      window.__hf = {
        duration: 1,
        seek: function () {}
      };
    </script>
  </body>
</html>`)
  return projectDir
}

describe("HyperFrames Engine visual backend spike", () => {
  timedTest("captures deterministic frame samples through the reusable backend contract", async () => {
    if (shouldSkipBrowserQa()) return

    const backend = getVisualCaptureBackend("engine")
    expect(backend).toBeTruthy()

    const projectDir = await makeQaProject()
    let cleanupPaths: string[] = []

    try {
      const result = await backend!.captureFrames({
        projectPath: projectDir,
        timestampsMs: [0, 500],
        fps: 30,
        width: 1920,
        height: 1080,
        format: "png",
        timeoutMs: 5000,
        reason: "qa",
        repoRoot,
      })
      cleanupPaths = result.cleanupPaths

      expect(result.backend).toBe("engine")
      expect(result.warnings).toEqual([])
      expect(result.frames).toHaveLength(2)
      expect(result.frames.map((frame) => frame.timeMs)).toEqual([0, 500])
      expect(result.frames.map((frame) => frame.frame)).toEqual([0, 15])
      expect(result.timings.targetMs).toBeGreaterThanOrEqual(0)
      expect(result.timings.serveMs).toBeGreaterThanOrEqual(0)
      expect(result.timings.sessionMs).toBeGreaterThanOrEqual(0)
      expect(result.timings.captureMs).toBeGreaterThanOrEqual(0)
      expect(result.cleanupPaths[0]).toContain(".ripple/visual-context/engine-")

      for (const frame of result.frames) {
        const info = await stat(frame.path)
        expect(frame.width).toBe(1920)
        expect(frame.height).toBe(1080)
        expect(frame.sizeBytes).toBe(info.size)
        expect(info.size).toBeGreaterThan(1000)
      }
    } finally {
      await backend?.dispose?.()
      await cleanupProject(projectDir, cleanupPaths)
    }
  }, 60000)

  timedTest("reuses a warm session for repeated captures of the same target", async () => {
    if (shouldSkipBrowserQa()) return

    const backend = new HyperframesEngineVisualBackend()
    const projectDir = await makeQaProject()
    const cleanupPaths: string[] = []

    try {
      const first = await backend.captureFrames({
        projectPath: projectDir,
        timestampsMs: [0],
        fps: 30,
        width: 1920,
        height: 1080,
        format: "png",
        timeoutMs: 5000,
        reason: "qa",
        repoRoot,
      })
      cleanupPaths.push(...first.cleanupPaths)

      const second = await backend.captureFrames({
        projectPath: projectDir,
        timestampsMs: [500],
        fps: 30,
        width: 1920,
        height: 1080,
        format: "png",
        timeoutMs: 5000,
        reason: "qa",
        repoRoot,
      })
      cleanupPaths.push(...second.cleanupPaths)

      expect(first.timings.sessionReused).toBe(0)
      expect(first.warnings).toEqual([])
      expect(second.timings.sessionReused).toBe(1)
      expect(second.warnings).toEqual([])
      expect(backend.getWarmSessionCount()).toBe(1)
      expect(second.frames[0].frame).toBe(15)

      await backend.invalidateProject({ projectPath: projectDir })
      expect(backend.getWarmSessionCount()).toBe(0)
    } finally {
      await backend.dispose()
      await cleanupProject(projectDir, cleanupPaths)
    }
  }, 60000)

  timedTest("targets a non-entry composition instead of silently falling back to the default entry", async () => {
    if (shouldSkipBrowserQa()) return

    const backend = getVisualCaptureBackend("engine")
    expect(backend).toBeTruthy()

    const projectDir = await makeNonEntryProject()
    let cleanupPaths: string[] = []

    try {
      const result = await backend!.captureFrames({
        projectPath: projectDir,
        compositionPath: "compositions/alternate.html",
        timestampsMs: [250],
        fps: 30,
        width: 320,
        height: 180,
        format: "png",
        timeoutMs: 5000,
        reason: "qa",
        repoRoot,
      })
      cleanupPaths = result.cleanupPaths

      expect(result.backend).toBe("engine")
      expect(result.warnings).toEqual([])
      expect(result.frames).toHaveLength(1)
      expect(result.frames[0].frame).toBe(8)
      expect((await stat(result.frames[0].path)).size).toBeGreaterThan(100)
    } finally {
      await backend?.dispose?.()
      await cleanupProject(projectDir, cleanupPaths)
    }
  }, 60000)
})
