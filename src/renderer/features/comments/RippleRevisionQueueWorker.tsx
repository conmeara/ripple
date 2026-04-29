"use client"

import { useCallback, useEffect, useRef } from "react"
import { trpc } from "../../lib/trpc"

export function RippleRevisionQueueWorker({
  projectId,
}: {
  projectId: string
}) {
  const processGeneratedChanges =
    trpc.agentRuntime.processGeneratedChanges.useMutation()
  const utils = trpc.useUtils()
  const pollDelayRef = useRef(300)

  const processNext = useCallback(async () => {
    const result = await processGeneratedChanges.mutateAsync({ projectId })
    if (result.claimed) {
      pollDelayRef.current = 300
      await Promise.all([
        utils.revisions.listThreads.invalidate(),
        utils.hyperframes.getPlayerSource.invalidate(),
        utils.hyperframes.getTimelineModel.invalidate(),
        utils.hyperframes.getProjectBrowserModel.invalidate(),
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
