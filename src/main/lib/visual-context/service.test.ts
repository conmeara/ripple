import { describe, expect, test } from "bun:test"
import { VisualContextMetrics } from "./metrics"
import { createVisualContextService } from "./service"
import type {
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualContextBackendId,
} from "./types"

function makeRequest(overrides: Partial<VisualCaptureFramesRequest> = {}): VisualCaptureFramesRequest {
  return {
    projectPath: "/project",
    timestampsMs: [0],
    fps: 30,
    width: 1920,
    height: 1080,
    format: "png",
    timeoutMs: 1000,
    reason: "qa",
    ...overrides,
  }
}

function makeResult(
  backend: VisualContextBackendId,
  request: VisualCaptureFramesRequest,
): VisualCaptureFramesResult {
  return {
    backend,
    frames: request.timestampsMs.map((timeMs, index) => ({
      index,
      timeMs,
      frame: Math.round((timeMs / 1000) * request.fps),
      path: `/tmp/${backend}-${index}.png`,
      width: request.width,
      height: request.height,
      sizeBytes: 100,
    })),
    elapsedMs: 10,
    timings: {},
    warnings: [],
    cleanupPaths: [],
  }
}

function backend(input: {
  id: VisualContextBackendId
  captureFrames: (request: VisualCaptureFramesRequest) => Promise<VisualCaptureFramesResult>
  invalidateProject?: (request: { projectPath: string; sourcePath?: string | null }) => Promise<void>
}): VisualCaptureBackend {
  const result: VisualCaptureBackend = {
    id: input.id,
    supportsWarmSession: true,
    captureFrames: input.captureFrames,
  }
  if (input.invalidateProject) {
    result.invalidateProject = input.invalidateProject
  }
  return result
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("Visual Context Service", () => {
  test("falls back from Engine to Producer capture with an explicit warning", async () => {
    const service = createVisualContextService({
      backendOrder: ["engine", "producer-capture"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async () => {
            throw new Error("engine unavailable")
          },
        }),
        "producer-capture": backend({
          id: "producer-capture",
          captureFrames: async (request) => makeResult("producer-capture", request),
        }),
      },
    })

    const request = makeRequest()
    const result = await service.captureSnapshot({
      projectPath: request.projectPath,
      fps: request.fps,
      width: request.width,
      height: request.height,
      format: request.format,
      timeoutMs: request.timeoutMs,
      timeMs: 500,
    })

    expect(result.backend).toBe("producer-capture")
    expect(result.fallbackFrom).toBe("engine")
    expect(result.warnings[0]).toContain("could not use engine")
    expect(result.frames.map((frame) => frame.timeMs)).toEqual([500])
  })

  test("serializes captures with the same project/composition/session key", async () => {
    let active = 0
    let maxActive = 0
    const releaseFirst = deferred<void>()
    const firstEntered = deferred<void>()
    const calls: number[] = []

    const service = createVisualContextService({
      maxActiveSessions: 2,
      backendOrder: ["engine"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (request) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            calls.push(request.timestampsMs[0])
            firstEntered.resolve()
            if (calls.length === 1) {
              await releaseFirst.promise
            }
            active -= 1
            return makeResult("engine", request)
          },
        }),
      },
    })

    const first = service.captureFrames(makeRequest({ timestampsMs: [0] }))
    await firstEntered.promise
    const second = service.captureFrames(makeRequest({ timestampsMs: [500] }))

    await Promise.resolve()
    expect(calls).toEqual([0])
    releaseFirst.resolve()
    await Promise.all([first, second])

    expect(calls).toEqual([0, 500])
    expect(maxActive).toBe(1)
  })

  test("allows different capture keys up to the global cap", async () => {
    let active = 0
    let maxActive = 0
    const release = deferred<void>()
    const entered = deferred<void>()

    const service = createVisualContextService({
      maxActiveSessions: 2,
      backendOrder: ["engine"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (request) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            if (active === 2) entered.resolve()
            await release.promise
            active -= 1
            return makeResult("engine", request)
          },
        }),
      },
    })

    const first = service.captureFrames(makeRequest({
      compositionPath: "index.html",
    }))
    const second = service.captureFrames(makeRequest({
      compositionPath: "compositions/alternate.html",
    }))

    await entered.promise
    expect(maxActive).toBe(2)
    release.resolve()
    await Promise.all([first, second])
  })

  test("rejects new work after shutdown", async () => {
    const service = createVisualContextService({
      backendOrder: ["engine"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (request) => makeResult("engine", request),
        }),
      },
    })

    await service.shutdown()
    await expect(service.captureFrames(makeRequest())).rejects.toThrow("shut down")
  })

  test("records capture, invalidation, and shutdown metrics", async () => {
    let now = 100
    const invalidations: Array<{ projectPath: string; sourcePath?: string | null }> = []
    const metrics = new VisualContextMetrics(() => now++)
    const service = createVisualContextService({
      metrics,
      backendOrder: ["engine"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (request) => makeResult("engine", request),
          invalidateProject: async (request) => {
            invalidations.push(request)
          },
        }),
      },
    })

    await service.captureFrames(makeRequest({ reason: "agent-context" }))
    await service.invalidateProject({ projectPath: "/project", sourcePath: "/project/workspace" })
    await service.shutdown()

    expect(metrics.snapshot()).toEqual([
      expect.objectContaining({
        type: "capture",
        backend: "engine",
        reason: "agent-context",
        fallbackFrom: null,
        createdAt: 100,
      }),
      expect.objectContaining({
        type: "invalidation",
        projectPath: "/project",
        sourcePath: "/project/workspace",
        createdAt: 101,
      }),
      expect.objectContaining({
        type: "shutdown",
        createdAt: 102,
      }),
    ])
    expect(invalidations).toEqual([{ projectPath: "/project", sourcePath: "/project/workspace" }])
  })
})
