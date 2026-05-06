import { describe, expect, test } from "bun:test"
import type { HyperframesSourceWatchEvent } from "../../../shared/hyperframes-source-watch"
import { refreshHyperframesSourceQueries } from "./source-refresh-queries"

function sourceEvent(overrides: Partial<HyperframesSourceWatchEvent> = {}): HyperframesSourceWatchEvent {
  return {
    projectId: "project-1",
    contextKey: "project:project-1",
    projectPath: "/tmp/ripple-project",
    changes: [{ path: "index.html", type: "change" }],
    timestamp: 123,
    subscriptionKey: "1:project:project-1",
    ...overrides,
  }
}

function makeUtils(calls: string[]) {
  return {
    hyperframes: {
      getPlayerSource: {
        invalidate: () => {
          calls.push("hyperframes.getPlayerSource")
        },
      },
      getTimelineModel: {
        invalidate: () => {
          calls.push("hyperframes.getTimelineModel")
        },
      },
      getProjectBrowserModel: {
        invalidate: (input: { projectId: string }) => {
          calls.push(`hyperframes.getProjectBrowserModel:${input.projectId}`)
        },
      },
    },
    projects: {
      listCompositions: {
        invalidate: (input: { projectId: string }) => {
          calls.push(`projects.listCompositions:${input.projectId}`)
        },
      },
    },
  }
}

describe("useHyperframesSourceChangeListener", () => {
  test("invalidates every preview-facing query before notifying the preview", async () => {
    const calls: string[] = []
    const event = sourceEvent()
    const notifications: HyperframesSourceWatchEvent[] = []

    await refreshHyperframesSourceQueries({
      utils: makeUtils(calls),
      projectId: "project-1",
      event,
      onChange: (notifiedEvent) => {
        calls.push("onChange")
        notifications.push(notifiedEvent)
      },
    })

    expect(calls).toEqual([
      "hyperframes.getPlayerSource",
      "hyperframes.getTimelineModel",
      "hyperframes.getProjectBrowserModel:project-1",
      "projects.listCompositions:project-1",
      "onChange",
    ])
    expect(notifications).toEqual([event])
  })

  test("still notifies the preview when cache invalidation fails", async () => {
    const event = sourceEvent()
    const notifications: HyperframesSourceWatchEvent[] = []
    const utils = makeUtils([])
    utils.hyperframes.getTimelineModel.invalidate = () => {
      throw new Error("query client unavailable")
    }

    await expect(refreshHyperframesSourceQueries({
      utils,
      projectId: "project-1",
      event,
      onChange: (notifiedEvent) => notifications.push(notifiedEvent),
    })).rejects.toThrow("query client unavailable")

    expect(notifications).toEqual([event])
  })
})
