import { useEffect, useRef } from "react"
import type {
  HyperframesSourceWatchEvent,
  HyperframesSourceWatchSubscriptionInput,
} from "../../../shared/hyperframes-source-watch"
import { trpc } from "../../lib/trpc"
import { refreshHyperframesSourceQueries } from "./source-refresh-queries"

interface UseHyperframesSourceChangeListenerOptions
  extends HyperframesSourceWatchSubscriptionInput {
  enabled?: boolean
  onChange?: (event: HyperframesSourceWatchEvent) => void
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
}
