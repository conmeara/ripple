import { describe, expect, test } from "bun:test"
import { buildGeneratedChangeRuntimeContext } from "./generated-change-runtime-context"

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
})
