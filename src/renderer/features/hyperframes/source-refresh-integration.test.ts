import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("HyperFrames source refresh integration", () => {
  test("reloads the center preview through the existing adapter path", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("useHyperframesSourceChangeListener")
    expect(source).toContain("sourceRefreshSeekTimeRef.current = displayTime")
    expect(source).toContain("adapter.reload({ seekTime: sourceRefreshSeekTimeRef.current })")
  })

  test("uses one refresh helper for filesystem, runtime, and revision updates", () => {
    const helper = readFileSync(
      "src/renderer/features/hyperframes/source-refresh-queries.ts",
      "utf8",
    )
    const listener = readFileSync(
      "src/renderer/features/hyperframes/use-hyperframes-source-change-listener.ts",
      "utf8",
    )
    const transport = readFileSync(
      "src/renderer/features/agents/lib/agent-runtime-chat-transport.ts",
      "utf8",
    )
    const comments = readFileSync(
      "src/renderer/features/comments/RippleCommentsPane.tsx",
      "utf8",
    )
    const queueWorker = readFileSync(
      "src/renderer/features/comments/RippleRevisionQueueWorker.tsx",
      "utf8",
    )

    expect(helper).toContain("clearPreviewCache?.()")
    expect(helper).toContain("getPlayerSource.invalidate()")
    expect(helper).toContain("getTimelineModel.invalidate()")
    expect(helper).toContain("getProjectBrowserModel.invalidate")
    expect(helper).toContain("revisions?.listThreads?.invalidate")
    expect(listener).toContain("HYPERFRAMES_RUNTIME_SOURCE_CHANGED_EVENT")
    expect(listener).toContain("clearRipplePreviewCoordinator")
    expect(listener).toContain("runtimeSourceChangeMatchesPreview")
    expect(transport).toContain("dispatchRuntimeSourceChange")
    expect(queueWorker).toContain("generatedChangeEvents.useSubscription")
    expect(queueWorker).toContain("dispatchRuntimeSourceChange")
    expect(comments).toContain("refreshHyperframesSourceQueries")
    expect(queueWorker).toContain("refreshHyperframesSourceQueries")
  })

  test("threads source refresh versions into composition thumbnails", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesProjectPane.tsx",
      "utf8",
    )

    expect(source).toContain("useHyperframesSourceChangeListener")
    expect(source).toContain("setSourceRefreshVersion((version) => version + 1)")
    expect(source).toContain("buildHyperframesPlayerFetchUrl(narrowedSourceUrl, refreshVersion)")
  })

  test("keeps non-interactive preview DOM out of accessibility snapshots", () => {
    const player = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )
    const adapter = readFileSync(
      "src/renderer/features/hyperframes/timeline-player-adapter.ts",
      "utf8",
    )
    const thumbnails = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesProjectPane.tsx",
      "utf8",
    )
    const prewarm = readFileSync(
      "src/renderer/features/hyperframes/preview-coordinator.ts",
      "utf8",
    )

    expect(player).toContain('role="img"')
    expect(player).toContain('aria-label={compositionId ? `${compositionId} composition preview` : "Composition preview"}')
    expect(player).toContain('aria-hidden="true"')
    expect(player).toContain("inert />")
    expect(adapter).toContain('player.setAttribute("aria-hidden", "true")')
    expect(adapter).toContain('player.setAttribute("inert", "")')
    expect(adapter).toContain('player.setAttribute("tabindex", "-1")')
    expect(thumbnails).toContain('aria-hidden="true"')
    expect(thumbnails).toContain("inert")
    expect(thumbnails).toContain("tabIndex={-1}")
    expect(prewarm).toContain('prewarmHost.setAttribute("aria-hidden", "true")')
    expect(prewarm).toContain('prewarmHost.setAttribute("inert", "")')
  })
})
