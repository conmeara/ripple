import { useEffect, useRef } from "react"
import type {
  HyperframesRuntimeSourceChangeEvent,
  HyperframesSourceRefreshEvent,
  HyperframesSourceWatchEvent,
  HyperframesSourceWatchSubscriptionInput,
} from "../../../shared/hyperframes-source-watch"
import {
  HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT,
} from "../../../shared/hyperframes-source-watch"
import { trpc } from "../../lib/trpc"
import { clearRipplePreviewCoordinator } from "./preview-coordinator"
import { runtimeSourceChangeMatchesPreview } from "./runtime-source-change-events"
import { refreshHyperframesSourceQueries } from "./source-refresh-queries"

interface UseHyperframesSourceChangeListenerOptions
  extends HyperframesSourceWatchSubscriptionInput {
  enabled?: boolean
  onChange?: (event: HyperframesSourceRefreshEvent) => void
}

export function useHyperframesSourceChangeListener({
  projectId,
  revisionId = null,
  chatId = null,
  enabled = true,
  onChange,
}: UseHyperframesSourceChangeListenerOptions) {
  const utils = trpc.useUtils()
  const subscriptionKeyRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (
      !enabled ||
      !projectId ||
      !window.desktopApi?.subscribeToHyperframesSourceWatcher ||
      !window.desktopApi?.unsubscribeFromHyperframesSourceWatcher ||
      !window.desktopApi?.onHyperframesSourceChanged
    ) {
      return
    }

    let cancelled = false

    const cleanupSourceChanged = window.desktopApi.onHyperframesSourceChanged?.((event) => {
      if (event.subscriptionKey !== subscriptionKeyRef.current) return

      void refreshHyperframesSourceQueries({
        utils,
        projectId,
        event,
        clearPreviewCache: clearRipplePreviewCoordinator,
        onChange: (latestEvent) => onChangeRef.current?.(latestEvent),
      }).catch((error) => {
        console.error("[HyperFramesSourceWatcher] Failed to refresh preview queries:", error)
      })
    })

    const subscribe = async () => {
      try {
        const subscription = await window.desktopApi?.subscribeToHyperframesSourceWatcher?.({
          projectId,
          revisionId,
          chatId,
        })

        if (!subscription) return

        if (cancelled) {
          await window.desktopApi?.unsubscribeFromHyperframesSourceWatcher?.(
            subscription.subscriptionKey,
          )
          return
        }

        subscriptionKeyRef.current = subscription.subscriptionKey
      } catch (error) {
        console.error("[HyperFramesSourceWatcher] Failed to subscribe:", error)
      }
    }

    void subscribe()

    return () => {
      cancelled = true
      cleanupSourceChanged?.()
      const subscriptionKey = subscriptionKeyRef.current
      subscriptionKeyRef.current = null
      if (subscriptionKey) {
        window.desktopApi?.unsubscribeFromHyperframesSourceWatcher?.(subscriptionKey).catch((error) => {
          console.error("[HyperFramesSourceWatcher] Failed to unsubscribe:", error)
        })
      }
    }
  }, [chatId, enabled, projectId, revisionId, utils])

  useEffect(() => {
    if (!enabled || !projectId || typeof window === "undefined") return

    const handleRuntimeSourceChanged = (rawEvent: Event) => {
      const runtimeEvent = rawEvent as CustomEvent<HyperframesRuntimeSourceChangeEvent>
      const detail = runtimeEvent.detail
      if (!detail || detail.source !== "agent-runtime") return
      if (!runtimeSourceChangeMatchesPreview(detail, { projectId, revisionId, chatId })) {
        return
      }

      void refreshHyperframesSourceQueries({
        utils,
        projectId,
        event: detail,
        clearPreviewCache: clearRipplePreviewCoordinator,
        onChange: (latestEvent) => onChangeRef.current?.(latestEvent),
      }).catch((error) => {
        console.error("[HyperFramesSourceWatcher] Failed to refresh runtime source changes:", error)
      })
    }

    window.addEventListener(
      HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT,
      handleRuntimeSourceChanged as EventListener,
    )
    return () => {
      window.removeEventListener(
        HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT,
        handleRuntimeSourceChanged as EventListener,
      )
    }
  }, [chatId, enabled, projectId, revisionId, utils])
}
