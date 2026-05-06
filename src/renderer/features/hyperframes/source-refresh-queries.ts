import type { HyperframesSourceWatchEvent } from "../../../shared/hyperframes-source-watch"

interface HyperframesSourceRefreshUtils {
  hyperframes: {
    getPlayerSource: { invalidate: () => Promise<unknown> | unknown }
    getTimelineModel: { invalidate: () => Promise<unknown> | unknown }
    getProjectBrowserModel: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
  }
  projects: {
    listCompositions: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
  }
}

export async function refreshHyperframesSourceQueries(input: {
  utils: HyperframesSourceRefreshUtils
  projectId: string
  event: HyperframesSourceWatchEvent
  onChange?: (event: HyperframesSourceWatchEvent) => void
}): Promise<void> {
  try {
    await Promise.all([
      input.utils.hyperframes.getPlayerSource.invalidate(),
      input.utils.hyperframes.getTimelineModel.invalidate(),
      input.utils.hyperframes.getProjectBrowserModel.invalidate({
        projectId: input.projectId,
      }),
      input.utils.projects.listCompositions.invalidate({
        projectId: input.projectId,
      }),
    ])
  } finally {
    input.onChange?.(input.event)
  }
}
