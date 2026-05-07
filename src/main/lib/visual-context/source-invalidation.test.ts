import { describe, expect, test } from "bun:test"
import { attachVisualContextSourceInvalidation } from "./source-invalidation"
import type { HyperframesSourceWatchBatchEvent } from "../hyperframes/source-watcher"
import type { VisualContextService } from "./types"

function makeEvent(projectPath: string): HyperframesSourceWatchBatchEvent {
  return {
    projectPath,
    changes: [{ path: "index.html", type: "change" }],
    timestamp: 123,
  }
}

describe("visual context source invalidation", () => {
  test("invalidates the service when the watched source changes", async () => {
    const listeners: Array<(event: HyperframesSourceWatchBatchEvent) => void> = []
    const invalidations: Array<{ projectPath: string; sourcePath?: string | null }> = []
    const service = {
      invalidateProject: async (input) => {
        invalidations.push(input)
      },
    } as VisualContextService

    const handle = await attachVisualContextSourceInvalidation({
      service,
      projectPath: "/project",
      sourcePath: "/workspace",
      watcherRegistry: {
        subscribe: async (projectPath, nextListener) => {
          expect(projectPath).toBe("/workspace")
          listeners.push(nextListener)
          return () => {
            listeners.length = 0
          }
        },
      },
    })

    listeners[0]?.(makeEvent("/workspace"))
    await Promise.resolve()

    expect(invalidations).toEqual([{
      projectPath: "/project",
      sourcePath: "/workspace",
    }])

    await handle.close()
    listeners[0]?.(makeEvent("/workspace"))
    await Promise.resolve()
    expect(invalidations).toHaveLength(1)
  })
})
