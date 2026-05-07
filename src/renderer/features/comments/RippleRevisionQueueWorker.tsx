"use client"

import { useCallback, useEffect, useRef } from "react"
import { parseRuntimeEventPayload } from "../../../shared/agent-runtime-ui-projection"
import { trpc } from "../../lib/trpc"
import { clearRipplePreviewCoordinator } from "../hyperframes/preview-coordinator"
import { refreshHyperframesSourceQueries } from "../hyperframes/source-refresh-queries"
import { dispatchRuntimeSourceChange } from "../hyperframes/runtime-source-change-events"

export function RippleRevisionQueueWorker({
  projectId,
}: {
  projectId: string
}) {
  const processGeneratedChanges =
    trpc.agentRuntime.processGeneratedChanges.useMutation()
  const utils = trpc.useUtils()
  const pollDelayRef = useRef(300)

  trpc.agentRuntime.generatedChangeEvents.useSubscription(
    { projectId },
    {
      enabled: Boolean(projectId),
      onData: (message) => {
        const revisionId = message.run?.revisionId
        if (!revisionId) return
        dispatchRuntimeSourceChange({
          payload: parseRuntimeEventPayload(message.event),
          runtimeContext: {
            projectId: message.projectId ?? projectId,
            revisionId,
            commentThreadId: message.run?.threadId ?? null,
            previewSource: { kind: "comment-revision", revisionId },
          },
          chatId: message.run?.chatId ?? message.run?.conversationId ?? null,
          subChatId: message.run?.subChatId ?? null,
        })
      },
    },
  )

  const processNext = useCallback(async () => {
    const result = await processGeneratedChanges.mutateAsync({ projectId })
    if (result.claimed) {
      pollDelayRef.current = 300
      await Promise.all([
        refreshHyperframesSourceQueries({
          utils,
          projectId,
          clearPreviewCache: clearRipplePreviewCoordinator,
        }),
        result.agentRunId
          ? utils.agentRuntime.getRun.invalidate({ runId: result.agentRunId })
          : Promise.resolve(),
      ])
      return
    }
    pollDelayRef.current = Math.min(pollDelayRef.current * 2, 2_500)
  }, [
    processGeneratedChanges,
    projectId,
    utils.agentRuntime.getRun,
    utils.hyperframes.getPlayerSource,
    utils.hyperframes.getProjectBrowserModel,
    utils.hyperframes.getTimelineModel,
    utils.revisions.listThreads,
  ])

  useEffect(() => {
    if (processGeneratedChanges.isPending) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void processNext().catch((error) => {
        console.warn(
          "[RippleRevisionQueueWorker] Could not process generated change:",
          error,
        )
      })
    }, pollDelayRef.current)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [processGeneratedChanges.isPending, processNext])

  return null
}
