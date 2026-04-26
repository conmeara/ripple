import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { PreviewManager } from "./preview-manager"
import type {
  HyperframesChildProcess,
  HyperframesProjectContext,
  HyperframesSpawnResult,
} from "./types"

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

describe("HyperFrames preview manager", () => {
  test("tracks preview startup output and idempotent stop", async () => {
    const child = createFakeChild(123)
    const manager = new PreviewManager({
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

    const started = await manager.start({ context })
    expect(started.status).toBe("starting")
    expect(started.url).toBe("http://localhost:4321")

    child.stdout.emit("data", Buffer.from("Studio running http://localhost:4321"))
    expect(manager.getStatus(context.key)?.status).toBe("running")

    const stopped = await manager.stop(context.key)
    expect(stopped?.status).toBe("stopped")
    expect(child.killed).toBe(true)
    await expect(manager.stop(context.key)).resolves.toMatchObject({
      status: "stopped",
    })
  })
})
