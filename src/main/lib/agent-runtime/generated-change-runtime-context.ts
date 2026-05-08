import type { CommentThread } from "../db"
import type { RevisionQueueRun } from "../revisions/revision-queue"
import type { AgentRuntimeContextPayload } from "./runtime-context"

export function buildGeneratedChangeRuntimeContext(input: {
  job: Pick<RevisionQueueRun, "projectId" | "revisionId" | "threadId">
  thread: Pick<
    CommentThread,
    "id" | "compositionId" | "startTime" | "startFrame"
  > | null
}): AgentRuntimeContextPayload | null {
  if (!input.thread) return null

  return {
    projectId: input.job.projectId,
    compositionId: input.thread.compositionId ?? null,
    commentThreadId: input.thread.id,
    revisionId: input.job.revisionId,
    previewSource: { kind: "comment-revision", revisionId: input.job.revisionId },
    previewTimeSeconds:
      typeof input.thread.startTime === "number"
        ? input.thread.startTime / 1000
        : null,
    previewFrame:
      typeof input.thread.startFrame === "number"
        ? input.thread.startFrame
        : null,
  }
}
