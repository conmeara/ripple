import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createVisualContextEndpoint } from "./endpoint"
import type {
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualContextService,
  VisualSnapshotInput,
} from "./types"

function makeResult(request: Pick<VisualCaptureFramesRequest, "timestampsMs" | "fps" | "width" | "height">): VisualCaptureFramesResult {
  return {
    backend: "engine",
    frames: request.timestampsMs.map((timeMs, index) => ({
      index,
      timeMs,
      frame: Math.round((timeMs / 1000) * request.fps),
      path: `/tmp/frame-${index}.png`,
      width: request.width,
      height: request.height,
      sizeBytes: 100,
    })),
    elapsedMs: 1,
    timings: {},
    warnings: [],
    cleanupPaths: [],
  }
}

function fakeService(): VisualContextService {
  return {
    warmProject: async () => undefined,
    captureFrames: async (request) => makeResult(request),
    captureSnapshot: async (request: VisualSnapshotInput) => makeResult({
      ...request,
      timestampsMs: [request.timeMs],
    }),
    invalidateProject: async () => undefined,
    shutdown: async () => undefined,
  }
}

async function postJson(input: {
  endpoint: string
  path: string
  token?: string
  body?: unknown
}): Promise<{ status: number; payload: any }> {
  const response = await fetch(`${input.endpoint}${input.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
    },
    body: JSON.stringify(input.body ?? {}),
  })
  return {
    status: response.status,
    payload: await response.json(),
  }
}

describe("Visual Context endpoint", () => {
  test("requires a token before serving capture requests", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    const handle = await createVisualContextEndpoint({
      service: fakeService(),
      workspaceRoot,
      token: "token-test",
    })
    try {
      const rejected = await postJson({
        endpoint: handle.endpoint,
        path: "/capture-frames",
        body: {},
      })

      expect(rejected.status).toBe(401)
      expect(rejected.payload.error.code).toBe("VISUAL_CONTEXT_UNAUTHORIZED")
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  test("rejects project paths outside the scoped workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    const outsideRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-outside-"))
    const handle = await createVisualContextEndpoint({
      service: fakeService(),
      workspaceRoot,
      token: "token-test",
    })
    try {
      const rejected = await postJson({
        endpoint: handle.endpoint,
        path: "/capture-frames",
        token: "token-test",
        body: {
          projectPath: outsideRoot,
          timestampsMs: [0],
          fps: 30,
          width: 1920,
          height: 1080,
          format: "png",
          timeoutMs: 1000,
          reason: "qa",
        },
      })

      expect(rejected.status).toBe(403)
      expect(rejected.payload.error.code).toBe("WORKSPACE_MISMATCH")
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  test("rejects output directories outside the scoped workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    const outsideRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-outside-"))
    const handle = await createVisualContextEndpoint({
      service: fakeService(),
      workspaceRoot,
      token: "token-test",
    })
    try {
      const rejected = await postJson({
        endpoint: handle.endpoint,
        path: "/capture-frames",
        token: "token-test",
        body: {
          projectPath: workspaceRoot,
          outputDir: outsideRoot,
          timestampsMs: [0],
          fps: 30,
          width: 1920,
          height: 1080,
          format: "png",
          timeoutMs: 1000,
          reason: "qa",
        },
      })

      expect(rejected.status).toBe(403)
      expect(rejected.payload.error.code).toBe("WORKSPACE_MISMATCH")
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  test("captures frames through the app-scoped service", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    const handle = await createVisualContextEndpoint({
      service: fakeService(),
      workspaceRoot,
      token: "token-test",
    })
    try {
      const accepted = await postJson({
        endpoint: handle.endpoint,
        path: "/snapshot",
        token: "token-test",
        body: {
          projectPath: workspaceRoot,
          timeMs: 500,
          fps: 30,
          width: 1920,
          height: 1080,
          format: "png",
          timeoutMs: 1000,
        },
      })

      expect(accepted.status).toBe(200)
      expect(accepted.payload.ok).toBe(true)
      expect(accepted.payload.result.backend).toBe("engine")
      expect(accepted.payload.result.frames[0].timeMs).toBe(500)
      expect(accepted.payload.result.frames[0].frame).toBe(15)
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  test("fails clearly for current-frame requests until preview identity is available", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    const handle = await createVisualContextEndpoint({
      service: fakeService(),
      workspaceRoot,
      token: "token-test",
    })
    try {
      const rejected = await postJson({
        endpoint: handle.endpoint,
        path: "/snapshot",
        token: "token-test",
        body: {
          projectPath: workspaceRoot,
          at: "current",
          fps: 30,
          width: 1920,
          height: 1080,
          format: "png",
          timeoutMs: 1000,
        },
      })

      expect(rejected.status).toBe(409)
      expect(rejected.payload.error.code).toBe("CURRENT_FRAME_UNAVAILABLE")
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  test("captures current-frame snapshots through a verified preview identity", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-visual-endpoint-workspace-"))
    let snapshotRequest: VisualSnapshotInput | null = null
    const service: VisualContextService = {
      ...fakeService(),
      captureSnapshot: async (request) => {
        snapshotRequest = request
        return makeResult({
          ...request,
          timestampsMs: [request.timeMs],
        })
      },
    }
    const handle = await createVisualContextEndpoint({
      service,
      workspaceRoot,
      token: "token-test",
      resolveCurrentFrameSnapshot: async () => ({
        projectPath: workspaceRoot,
        compositionPath: "index.html",
        timeMs: 733,
        fps: 24,
        width: 1280,
        height: 720,
      }),
    })
    try {
      const accepted = await postJson({
        endpoint: handle.endpoint,
        path: "/snapshot",
        token: "token-test",
        body: {
          projectPath: workspaceRoot,
          at: "current",
          fps: 30,
          width: 1920,
          height: 1080,
          format: "png",
          timeoutMs: 1000,
        },
      })

      expect(accepted.status).toBe(200)
      expect(accepted.payload.ok).toBe(true)
      expect(accepted.payload.result.frames[0]).toEqual(expect.objectContaining({
        timeMs: 733,
        frame: 18,
        width: 1280,
        height: 720,
      }))
      expect(snapshotRequest).toEqual(expect.objectContaining({
        projectPath: workspaceRoot,
        compositionPath: "index.html",
        timeMs: 733,
        fps: 24,
        width: 1280,
        height: 720,
      }))
    } finally {
      await handle.close()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })
})
