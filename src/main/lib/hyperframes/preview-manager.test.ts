import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { PreviewManager } from "./preview-manager"
import type {
  HyperframesChildProcess,
  HyperframesProjectContext,
  HyperframesSpawnResult,
} from "./types"
import { HyperframesError } from "./types"

function createFakeChild(pid: number): HyperframesChildProcess {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = pid
  child.killed = false
  child.kill = (() => {
    child.killed = true
    queueMicrotask(() => child.emit("close", null, "SIGTERM"))
    return true
  })
  return child as HyperframesChildProcess
}

const context = {
  key: "project:project-1",
  projectId: "project-1",
  projectPath: "/Users/example/Ripple/launch",
  project: {
    id: "project-1",
    name: "Launch",
    path: "/Users/example/Ripple/launch",
    localPath: "/Users/example/Ripple/launch",
  },
} as HyperframesProjectContext

function createPreviewManager(child = createFakeChild(123)): PreviewManager {
  return new PreviewManager({
    allocatePort: async () => 4321,
    spawnPreview: async (): Promise<HyperframesSpawnResult> => ({
      child,
      command: {
        command: "hyperframes",
        argsPrefix: [],
        env: {},
        source: "global",
        version: "0.4.28",
      },
      args: [],
    }),
  })
}

async function expectHyperframesErrorCode(
  promise: Promise<unknown>,
  code: string,
) {
  try {
    await promise
    throw new Error("Expected HyperframesError")
  } catch (error) {
    expect(error).toBeInstanceOf(HyperframesError)
    expect((error as HyperframesError).code).toBe(code)
  }
}

describe("HyperFrames preview manager", () => {
  test("tracks preview startup output and idempotent stop", async () => {
    const child = createFakeChild(123)
    const manager = createPreviewManager(child)

    const started = await manager.start({ context })
    expect(started.status).toBe("starting")
    expect(started.url).toBe("http://localhost:4321")

    child.stdout.emit("data", Buffer.from("Studio running http://localhost:4321"))
    expect(manager.getStatus(context.key)?.status).toBe("running")
    await expect(
      manager.waitUntilRunning(context.key, { timeoutMs: 1000, intervalMs: 1 }),
    ).resolves.toMatchObject({
      status: "running",
      url: "http://localhost:4321",
    })

    const stopped = await manager.stop(context.key)
    expect(stopped?.status).toBe("stopped")
    expect(child.killed).toBe(true)
    await expect(manager.stop(context.key)).resolves.toMatchObject({
      status: "stopped",
    })
  })

  test("rejects readiness wait when no preview exists", async () => {
    const manager = createPreviewManager()

    await expectHyperframesErrorCode(
      manager.waitUntilRunning("missing-preview", {
        timeoutMs: 1000,
        intervalMs: 1,
      }),
      "PREVIEW_NOT_FOUND",
    )
  })

  test("rejects readiness wait when preview startup times out", async () => {
    const manager = createPreviewManager()

    await manager.start({ context })

    await expectHyperframesErrorCode(
      manager.waitUntilRunning(context.key, {
        timeoutMs: 0,
        intervalMs: 1,
      }),
      "PREVIEW_START_TIMEOUT",
    )
  })

  test("rejects readiness wait when preview stops before running", async () => {
    const child = createFakeChild(123)
    const manager = createPreviewManager(child)

    await manager.start({ context })
    await manager.stop(context.key)

    await expectHyperframesErrorCode(
      manager.waitUntilRunning(context.key, {
        timeoutMs: 1000,
        intervalMs: 1,
      }),
      "PREVIEW_STOPPED",
    )
  })

  test("rejects readiness wait when preview startup errors", async () => {
    const child = createFakeChild(123)
    const manager = createPreviewManager(child)

    await manager.start({ context })
    child.emit("error", new Error("Preview exploded"))

    await expectHyperframesErrorCode(
      manager.waitUntilRunning(context.key, {
        timeoutMs: 1000,
        intervalMs: 1,
      }),
      "PREVIEW_START_FAILED",
    )
  })
})
