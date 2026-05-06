import { BrowserWindow, ipcMain } from "electron"
import type {
  HyperframesSourceWatchEvent,
  HyperframesSourceWatchSubscription,
  HyperframesSourceWatchSubscriptionInput,
} from "../../../shared/hyperframes-source-watch"
import {
  assertHyperframesProjectFiles,
  resolveHyperframesPreviewContext,
} from "./project-context"
import {
  hyperframesSourceWatcherRegistry,
  type HyperframesSourceWatchBatchEvent,
} from "./source-watcher"

interface ActiveSourceSubscription {
  windowId: number
  contextKey: string
  projectId: string
  projectPath: string
  count: number
  unsubscribe: () => void
}

const activeSubscriptions = new Map<string, ActiveSourceSubscription>()

function buildSubscriptionKey(windowId: number, contextKey: string): string {
  return `${windowId}:${contextKey}`
}

/**
 * Register IPC handlers for HyperFrames source watching.
 *
 * This mirrors HyperFrames Studio's file-change refresh model, but resolves
 * Ripple's active preview context first so Main, chat worktrees, and revision
 * previews all watch the source tree the player is actually rendering.
 */
export function registerHyperframesSourceWatcherIPC(): void {
  ipcMain.handle(
    "hyperframes:subscribe-source-watcher",
    async (
      event,
      input: HyperframesSourceWatchSubscriptionInput,
    ): Promise<HyperframesSourceWatchSubscription | null> => {
      if (!input?.projectId) return null

      const subscribingWindow = BrowserWindow.fromWebContents(event.sender)
      if (!subscribingWindow || subscribingWindow.isDestroyed()) return null

      const context = await resolveHyperframesPreviewContext(input)
      assertHyperframesProjectFiles(context.projectPath)

      const windowId = subscribingWindow.id
      const subscriptionKey = buildSubscriptionKey(windowId, context.key)
      const existing = activeSubscriptions.get(subscriptionKey)
      if (existing) {
        existing.count += 1
        return {
          subscriptionKey,
          contextKey: context.key,
          projectPath: context.projectPath,
        }
      }

      const unsubscribe = await hyperframesSourceWatcherRegistry.subscribe(
        context.projectPath,
        (watchEvent: HyperframesSourceWatchBatchEvent) => {
          const subscription = activeSubscriptions.get(subscriptionKey)
          if (!subscription) return

          const targetWindow = BrowserWindow.fromId(subscription.windowId)
          if (!targetWindow || targetWindow.isDestroyed()) return

          const payload: HyperframesSourceWatchEvent = {
            projectId: subscription.projectId,
            contextKey: subscription.contextKey,
            projectPath: watchEvent.projectPath,
            changes: watchEvent.changes,
            timestamp: watchEvent.timestamp,
            subscriptionKey,
          }

          try {
            targetWindow.webContents.send("hyperframes:source-changed", payload)
          } catch {
            // Window may have been destroyed between lookup and send.
          }
        },
      )

      activeSubscriptions.set(subscriptionKey, {
        windowId,
        contextKey: context.key,
        projectId: input.projectId,
        projectPath: context.projectPath,
        count: 1,
        unsubscribe,
      })

      console.log(
        `[HyperFramesSourceWatcher] Window ${windowId} subscribed to: ${context.projectPath}`,
      )

      return {
        subscriptionKey,
        contextKey: context.key,
        projectPath: context.projectPath,
      }
    },
  )

  ipcMain.handle(
    "hyperframes:unsubscribe-source-watcher",
    async (_event, subscriptionKey: string) => {
      if (!subscriptionKey) return

      const subscription = activeSubscriptions.get(subscriptionKey)
      if (!subscription) return

      subscription.count -= 1
      if (subscription.count > 0) return

      subscription.unsubscribe()
      activeSubscriptions.delete(subscriptionKey)
      console.log(
        `[HyperFramesSourceWatcher] Window ${subscription.windowId} unsubscribed from: ${subscription.projectPath}`,
      )
    },
  )
}

export function cleanupHyperframesSourceWindowSubscriptions(windowId: number): void {
  for (const [subscriptionKey, subscription] of activeSubscriptions) {
    if (subscription.windowId !== windowId) continue
    subscription.unsubscribe()
    activeSubscriptions.delete(subscriptionKey)
    console.log(
      `[HyperFramesSourceWatcher] Cleaned up subscription for closed window ${windowId}: ${subscription.projectPath}`,
    )
  }
}

export async function cleanupHyperframesSourceWatchers(): Promise<void> {
  for (const subscription of activeSubscriptions.values()) {
    subscription.unsubscribe()
  }
  activeSubscriptions.clear()
  await hyperframesSourceWatcherRegistry.disposeAll()
  console.log("[HyperFramesSourceWatcher] All watchers cleaned up")
}
