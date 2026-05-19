import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAgentVisualContextFileBridge } from "./visual-context-file-bridge"
import type { VisualContextService } from "../visual-context"

describe("agent visual context file bridge", () => {
  test("prewarms the agent workspace render path without blocking bridge creation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-agent-visual-bridge-"))
    const warmRequests: unknown[] = []
    const warmRelease: { current: (() => void) | null } = { current: null }
    const service: VisualContextService = {
      warmProject: async (input) => {
        warmRequests.push(input)
        await new Promise<void>((resolve) => {
          warmRelease.current = resolve
        })
      },
      captureFrames: async () => {
        throw new Error("captureFrames was not expected.")
      },
      captureSnapshot: async () => {
        throw new Error("captureSnapshot was not expected.")
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }

    try {
      const bridge = await createAgentVisualContextFileBridge(workspaceRoot, {
        runId: "run-1",
        service,
        prewarmCurrentFrameSnapshot: {
          projectPath: workspaceRoot,
          sourcePath: workspaceRoot,
          compositionPath: "index.html",
          timeMs: 500,
          fps: 30,
          width: 1280,
          height: 720,
        },
      })

      expect(bridge).toBeTruthy()
      expect(warmRequests).toEqual([{
        projectPath: workspaceRoot,
        sourcePath: workspaceRoot,
        compositionPath: "index.html",
        sourceRevisionId: null,
        fps: 30,
        width: 1280,
        height: 720,
        format: "png",
      }])

      warmRelease.current?.()
      await bridge?.close()
    } finally {
      warmRelease.current?.()
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })
})
