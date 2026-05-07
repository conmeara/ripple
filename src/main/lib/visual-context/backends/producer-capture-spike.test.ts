import { describe, expect, test } from "bun:test"
import { cp, mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { resolveProducerBrowserPath } from "../../hyperframes/runtime"
import { getVisualCaptureBackend, listImplementedVisualCaptureBackends } from "../backend-registry"

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
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-producer-capture-backend-"))
  await cp(qaFixtureRoot, projectDir, { recursive: true })
  return projectDir
}

describe("HyperFrames Producer capture backend spike", () => {
  test("registers Engine and Producer capture as implemented backend rungs", () => {
    expect(listImplementedVisualCaptureBackends().map((backend) => backend.id)).toEqual([
      "engine",
      "producer-capture",
      "fast-browser",
      "hyperframes-cli",
    ])
    expect(getVisualCaptureBackend("preview")).toBeNull()
  })

  timedTest("captures a deterministic frame through the reusable Producer capture adapter", async () => {
    if (shouldSkipBrowserQa()) return

    const backend = getVisualCaptureBackend("producer-capture")
    expect(backend).toBeTruthy()

    const projectDir = await makeQaProject()
    let cleanupPaths: string[] = []

    try {
      const result = await backend!.captureFrames({
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
      cleanupPaths = result.cleanupPaths

      expect(result.backend).toBe("producer-capture")
      expect(result.frames).toHaveLength(1)
      expect(result.frames[0].timeMs).toBe(500)
      expect(result.frames[0].frame).toBe(15)
      expect(result.frames[0].width).toBe(1920)
      expect(result.frames[0].height).toBe(1080)
      expect(result.cleanupPaths[0]).toContain(".ripple/visual-context/producer-capture-")
      expect((await stat(result.frames[0].path)).size).toBeGreaterThan(1000)
    } finally {
      await backend?.dispose?.()
      await Promise.all(cleanupPaths.map((path) =>
        rm(path, { recursive: true, force: true }).catch(() => undefined)
      ))
      await rm(projectDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 60000)
})
