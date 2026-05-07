import type { HyperframesSourceRefreshEvent } from "../../../shared/hyperframes-source-watch"

interface HyperframesSourceRefreshUtils {
  hyperframes: {
    getPlayerSource: { invalidate: () => Promise<unknown> | unknown }
    getTimelineModel: { invalidate: () => Promise<unknown> | unknown }
    getProjectBrowserModel: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
    listCompositions?: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
  }
  projects: {
    listCompositions: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
  }
  revisions?: {
    listThreads?: { invalidate: () => Promise<unknown> | unknown }
    listActivitySummary?: { invalidate: (input: { projectId: string }) => Promise<unknown> | unknown }
  }
}

export async function refreshHyperframesSourceQueries(input: {
  utils: HyperframesSourceRefreshUtils
  projectId: string
  event?: HyperframesSourceRefreshEvent
  includeComments?: boolean
  clearPreviewCache?: () => void
  onChange?: (event: HyperframesSourceRefreshEvent) => void
}): Promise<void> {
  try {
    input.clearPreviewCache?.()

    const invalidations: Array<Promise<unknown> | unknown> = [
      input.utils.hyperframes.getPlayerSource.invalidate(),
      input.utils.hyperframes.getTimelineModel.invalidate(),
      input.utils.hyperframes.getProjectBrowserModel.invalidate({
        projectId: input.projectId,
      }),
      input.utils.projects.listCompositions.invalidate({
        projectId: input.projectId,
      }),
    ]

    if (input.utils.hyperframes.listCompositions) {
      invalidations.push(
        input.utils.hyperframes.listCompositions.invalidate({
          projectId: input.projectId,
        }),
      )
    }

    if (input.includeComments ?? true) {
      invalidations.push(
        input.utils.revisions?.listThreads?.invalidate(),
        input.utils.revisions?.listActivitySummary?.invalidate({
          projectId: input.projectId,
        }),
      )
    }

    await Promise.all(invalidations.filter(Boolean))
  } finally {
    if (input.event) {
      input.onChange?.(input.event)
    }
  }
}
