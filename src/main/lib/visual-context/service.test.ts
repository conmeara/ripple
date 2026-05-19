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
  warmProject?: (request: VisualCaptureFramesRequest) => Promise<void>
  invalidateProject?: (request: { projectPath: string; sourcePath?: string | null }) => Promise<void>
  dispose?: () => Promise<void>
}): VisualCaptureBackend {
  const result: VisualCaptureBackend = {
    id: input.id,
    supportsWarmSession: true,
    captureFrames: input.captureFrames,
  }
  if (input.warmProject) {
    result.warmProject = input.warmProject
  }
  if (input.invalidateProject) {
    result.invalidateProject = input.invalidateProject
  }
  if (input.dispose) {
    result.dispose = input.dispose
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
  test("routes current-frame intent only to the preview backend", async () => {
    const calls: VisualContextBackendId[] = []
    const request = makeRequest({
      intent: "current-frame",
      previewSurfaceKey: "project-1:composition-1:main",
    })
    const service = createVisualContextService({
      backendOrder: ["engine", "preview"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "engine")
            return makeResult("engine", input)
          },
        }),
        preview: backend({
          id: "preview",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "preview")
            return makeResult("preview", input)
          },
        }),
      },
    })

    const result = await service.captureFrames(request)

    expect(result.backend).toBe("preview")
    expect(result.fallbackFrom).toBeUndefined()
    expect(calls).toEqual(["preview"])
  })

  test("fails current-frame intent instead of falling back to rendered backends", async () => {
    const calls: VisualContextBackendId[] = []
    const service = createVisualContextService({
      backendOrder: ["engine", "producer-capture"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "engine")
            return makeResult("engine", input)
          },
        }),
        "producer-capture": backend({
          id: "producer-capture",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "producer-capture")
            return makeResult("producer-capture", input)
          },
        }),
      },
    })

    await expect(service.captureFrames(makeRequest({
      intent: "current-frame",
      previewSurfaceKey: "project-1:composition-1:main",
    }))).rejects.toThrow("Current-frame visual context requires the live preview backend")
    expect(calls).toEqual([])
  })

  test("keeps render intents off the preview backend", async () => {
    const calls: VisualContextBackendId[] = []
    const service = createVisualContextService({
      backendOrder: ["preview", "engine"],
      backends: {
        preview: backend({
          id: "preview",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "preview")
            return makeResult("preview", input)
          },
        }),
        engine: backend({
          id: "engine",
          captureFrames: async (input) => {
            calls.push(input.preferredBackend ?? "engine")
            return makeResult("engine", input)
          },
        }),
      },
    })

    const snapshot = await service.captureSnapshot({
      projectPath: "/project",
      timeMs: 500,
      fps: 30,
      width: 1920,
      height: 1080,
      format: "png",
      timeoutMs: 1000,
      intent: "specific-frame",
    })
    const sheet = await service.captureFrames(makeRequest({
      timestampsMs: [0, 500, 1000],
      intent: "frame-sheet",
      reason: "frame-sheet",
    }))

    expect(snapshot.backend).toBe("engine")
    expect(sheet.backend).toBe("engine")
    expect(calls).toEqual(["engine", "engine"])
  })

  test("warms the first render backend without touching the preview backend", async () => {
    const warmed: VisualCaptureFramesRequest[] = []
    const service = createVisualContextService({
      backendOrder: ["preview", "engine", "producer-capture"],
      backends: {
        preview: backend({
          id: "preview",
          captureFrames: async (input) => makeResult("preview", input),
          warmProject: async () => {
            throw new Error("Preview should not be prewarmed as a render backend.")
          },
        }),
        engine: backend({
          id: "engine",
          captureFrames: async (input) => makeResult("engine", input),
          warmProject: async (input) => {
            warmed.push(input)
          },
        }),
      },
    })

    await service.warmProject({
      projectPath: "/project",
      sourcePath: "/project",
      compositionPath: "index.html",
      sourceRevisionId: null,
      fps: 30,
      width: 1920,
      height: 1080,
      format: "png",
    })

    expect(warmed).toHaveLength(1)
    expect(warmed[0]).toMatchObject({
      projectPath: "/project",
      sourcePath: "/project",
      compositionPath: "index.html",
      timestampsMs: [0],
      timeoutMs: 5_000,
      reason: "agent-context",
      intent: "specific-frame",
      preferredBackend: "engine",
    })
  })

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

  test("shutdown disposes custom backends owned by the service", async () => {
    let disposed = 0
    const service = createVisualContextService({
      backendOrder: ["engine"],
      backends: {
        engine: backend({
          id: "engine",
          captureFrames: async (request) => makeResult("engine", request),
          dispose: async () => {
            disposed += 1
          },
        }),
      },
    })

    await service.shutdown()
    await service.shutdown()

    expect(disposed).toBe(1)
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
