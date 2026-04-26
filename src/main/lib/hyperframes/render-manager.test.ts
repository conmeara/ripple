import { afterEach, describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { RenderManager } from "./render-manager"
import type {
  HyperframesChildProcess,
  HyperframesProjectContext,
  HyperframesSpawnResult,
} from "./types"

const tempDirs: string[] = []

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

async function makeContext(): Promise<HyperframesProjectContext> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-hyperframes-render-"))
  tempDirs.push(projectPath)
  await mkdir(join(projectPath, "exports"), { recursive: true })
  return {
    key: "project:project-1",
    projectId: "project-1",
    projectPath,
    project: {
      id: "project-1",
      name: "Launch",
      slug: "launch",
      path: projectPath,
      localPath: projectPath,
    },
  } as HyperframesProjectContext
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("HyperFrames render manager", () => {
  test("marks a render completed when the output exists", async () => {
    const child = createFakeChild(456)
    const context = await makeContext()
    const manager = new RenderManager({
      spawnRender: async (): Promise<HyperframesSpawnResult> => ({
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

    const started = await manager.start({
      context,
      format: "mp4",
      fps: 30,
      quality: "draft",
    })
    await writeFile(started.outputPath, "video", "utf8")
    child.emit("close", 0, null)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(manager.getStatus(started.jobId)).toMatchObject({
      status: "completed",
      outputSizeBytes: 5,
    })
  })

  test("cancels an in-flight render", async () => {
    const child = createFakeChild(789)
    const context = await makeContext()
    const manager = new RenderManager({
      spawnRender: async (): Promise<HyperframesSpawnResult> => ({
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

    const started = await manager.start({
      context,
      format: "mp4",
      fps: 30,
      quality: "draft",
    })
    const cancelled = manager.cancel(started.jobId)

    expect(cancelled?.status).toBe("cancelled")
    expect(child.killed).toBe(true)
  })

  test("cancels all in-flight renders", async () => {
    const firstChild = createFakeChild(101)
    const secondChild = createFakeChild(102)
    const context = await makeContext()
    const children = [firstChild, secondChild]
    const manager = new RenderManager({
      spawnRender: async (): Promise<HyperframesSpawnResult> => ({
        child: children.shift()!,
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

    await manager.start({
      context,
      format: "mp4",
      fps: 30,
      quality: "draft",
    })
    await manager.start({
      context,
      format: "mp4",
      fps: 30,
      quality: "draft",
    })

    expect(manager.cancelAll().map((state) => state.status)).toEqual([
      "cancelled",
      "cancelled",
    ])
    expect(firstChild.killed).toBe(true)
    expect(secondChild.killed).toBe(true)
  })
})
