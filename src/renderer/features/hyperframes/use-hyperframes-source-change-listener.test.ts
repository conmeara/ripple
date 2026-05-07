import { describe, expect, test } from "bun:test"
import type {
  HyperframesRuntimeSourceChangeEvent,
  HyperframesSourceRefreshEvent,
  HyperframesSourceWatchEvent,
} from "../../../shared/hyperframes-source-watch"
import { runtimeSourceChangeMatchesPreview } from "./runtime-source-change-events"
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
      listCompositions: {
        invalidate: (input: { projectId: string }) => {
          calls.push(`hyperframes.listCompositions:${input.projectId}`)
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
    revisions: {
      listThreads: {
        invalidate: () => {
          calls.push("revisions.listThreads")
        },
      },
      listActivitySummary: {
        invalidate: (input: { projectId: string }) => {
          calls.push(`revisions.listActivitySummary:${input.projectId}`)
        },
      },
    },
  }
}

function runtimeEvent(
  overrides: Partial<HyperframesRuntimeSourceChangeEvent> = {},
): HyperframesRuntimeSourceChangeEvent {
  return {
    source: "agent-runtime",
    projectId: "project-1",
    previewSource: { kind: "main" },
    changes: [{ path: "index.html", type: "change" }],
    timestamp: 123,
    ...overrides,
  }
}

describe("useHyperframesSourceChangeListener", () => {
  test("rejects projectless runtime events for project-scoped previews", () => {
    expect(runtimeSourceChangeMatchesPreview(
      runtimeEvent({ projectId: null }),
      { projectId: "project-1" },
    )).toBe(false)
    expect(runtimeSourceChangeMatchesPreview(
      runtimeEvent({ projectId: "project-2" }),
      { projectId: "project-1" },
    )).toBe(false)
    expect(runtimeSourceChangeMatchesPreview(
      runtimeEvent({ projectId: "project-1" }),
      { projectId: "project-1" },
    )).toBe(true)
  })

  test("invalidates every preview-facing query before notifying the preview", async () => {
    const calls: string[] = []
    const event = sourceEvent()
    const notifications: HyperframesSourceRefreshEvent[] = []

    await refreshHyperframesSourceQueries({
      utils: makeUtils(calls),
      projectId: "project-1",
      event,
      clearPreviewCache: () => calls.push("clearPreviewCache"),
      onChange: (notifiedEvent) => {
        calls.push("onChange")
        notifications.push(notifiedEvent)
      },
    })

    expect(calls).toEqual([
      "clearPreviewCache",
      "hyperframes.getPlayerSource",
      "hyperframes.getTimelineModel",
      "hyperframes.getProjectBrowserModel:project-1",
      "projects.listCompositions:project-1",
      "hyperframes.listCompositions:project-1",
      "revisions.listThreads",
      "revisions.listActivitySummary:project-1",
      "onChange",
    ])
    expect(notifications).toEqual([event])
  })

  test("still notifies the preview when cache invalidation fails", async () => {
    const event = sourceEvent()
    const notifications: HyperframesSourceRefreshEvent[] = []
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
