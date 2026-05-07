import {
  hyperframesSourceWatcherRegistry,
  type HyperframesSourceWatchBatchEvent,
} from "../hyperframes/source-watcher"
import type { VisualContextService } from "./types"

export interface VisualContextSourceWatcherRegistry {
  subscribe(
    projectPath: string,
    listener: (event: HyperframesSourceWatchBatchEvent) => void,
  ): Promise<() => void>
}

export interface VisualContextSourceInvalidationHandle {
  close(): Promise<void>
}

export async function attachVisualContextSourceInvalidation(input: {
  service: VisualContextService
  projectPath: string
  sourcePath?: string | null
  watcherRegistry?: VisualContextSourceWatcherRegistry
}): Promise<VisualContextSourceInvalidationHandle> {
  const watchedPath = input.sourcePath ?? input.projectPath
  const registry = input.watcherRegistry ?? hyperframesSourceWatcherRegistry
  let closed = false

  const unsubscribe = await registry.subscribe(
    watchedPath,
    (event) => {
      if (closed) return
      void input.service.invalidateProject({
        projectPath: input.projectPath,
        sourcePath: event.projectPath,
      }).catch((error) => {
        console.warn("[Ripple] Visual context source invalidation failed:", error)
      })
    },
  )

  return {
    close: async () => {
      if (closed) return
      closed = true
      unsubscribe()
    },
  }
}
