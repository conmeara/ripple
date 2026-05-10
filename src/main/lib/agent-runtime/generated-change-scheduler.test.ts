import { describe, expect, test } from "bun:test"
import { drainGeneratedChangeQueueForProject } from "./generated-change-queue-drain"
import { buildGeneratedChangeRuntimeContext } from "./generated-change-runtime-context"

interface TestSchedulerResult {
  updated: number
  claimed: boolean
  revisionId: string | null
  agentRunId: string | null
  status: "idle" | "completed"
}

describe("generated change scheduler", () => {
  test("carries comment frame context into the agent run", () => {
    expect(buildGeneratedChangeRuntimeContext({
      job: {
        projectId: "project-1",
        revisionId: "revision-1",
        threadId: "thread-1",
      },
      thread: {
        id: "thread-1",
        compositionId: "composition-1",
        startTime: 2150,
        startFrame: 65,
      } as any,
    })).toEqual({
      projectId: "project-1",
      compositionId: "composition-1",
      commentThreadId: "thread-1",
      revisionId: "revision-1",
      previewSource: { kind: "comment-revision", revisionId: "revision-1" },
      previewTimeSeconds: 2.15,
      previewFrame: 65,
    })
  })

  test("drains multiple comment agents in parallel", async () => {
    let claimed = 0
    let active = 0
    let maxActive = 0
    const processQueue = async (): Promise<TestSchedulerResult> => {
      const index = claimed
      claimed += 1
      if (index >= 3) {
        return {
          updated: 0,
          claimed: false,
          revisionId: null,
          agentRunId: null,
          status: "idle",
        }
      }

      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active -= 1
      return {
        updated: 0,
        claimed: true,
        revisionId: `revision-${index}`,
        agentRunId: `run-${index}`,
        status: "completed",
      }
    }

    await drainGeneratedChangeQueueForProject(
      { projectId: "project-1" },
      { parallelism: 3, processor: processQueue },
    )

    expect(maxActive).toBeGreaterThan(1)
  })
})
