import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  fitPreviewStageSize,
  formatPreviewTimecode,
  getPreviewPlayerControlLayout,
  resolvePreviewNavigationHold,
  resolvePreviewSeekRequestTime,
  shouldRenderPreviewCloseControl,
  shouldIssuePreviewSeekRequest,
  shouldSettlePreviewSeekRequest,
  shouldTogglePreviewPlaybackForSpacebar,
} from "./preview-player-controls"

function targetMatchingSelector(selectorFragment: string): EventTarget {
  return {
    closest: (selector: string) => selector.includes(selectorFragment) ? {} : null,
  } as unknown as EventTarget
}

function neutralShortcutTarget(): EventTarget {
  return {
    closest: () => null,
  } as unknown as EventTarget
}

function inputShortcutTarget(type: string): EventTarget {
  const inputElement = {
    type,
    getAttribute: () => type,
  }

  return {
    closest: (selector: string) => selector === "input" ? inputElement : null,
  } as unknown as EventTarget
}

describe("HyperFrames preview player controls", () => {
  test("shows the close affordance whenever the host supplies onClose", () => {
    expect(shouldRenderPreviewCloseControl(undefined)).toBe(false)
    expect(shouldRenderPreviewCloseControl(null)).toBe(false)
    expect(shouldRenderPreviewCloseControl(() => {})).toBe(true)
  })

  test("keeps settings limited to controls with real preview behavior", () => {
    expect(PREVIEW_SETTINGS_CONTROLS).toEqual([
      "zoom",
      "reload-preview",
    ])
    expect(PREVIEW_SETTINGS_CONTROLS).not.toContain("quality")
  })

  test("keeps zoom as a real preview setting", () => {
    expect(ZOOM_OPTIONS.map((option) => option.value)).toEqual([
      "fit",
      "50",
      "75",
      "100",
      "125",
      "150",
    ])
  })

  test("formats preview timecode with the active timeline fps", () => {
    expect(formatPreviewTimecode(1.25, 60)).toBe("00:00:01:15")
    expect(formatPreviewTimecode(1.25, 24)).toBe("00:00:01:06")
    expect(formatPreviewTimecode(1.25)).toBe("00:00:01:08")
  })

  test("fits preview media by width or height while preserving source aspect", () => {
    expect(fitPreviewStageSize({
      containerWidth: 640,
      containerHeight: 240,
      sourceWidth: 1920,
      sourceHeight: 1080,
      zoom: "fit",
    })).toEqual({
      width: 426.66666666666663,
      height: 240,
    })

    expect(fitPreviewStageSize({
      containerWidth: 320,
      containerHeight: 800,
      sourceWidth: 1920,
      sourceHeight: 1080,
      zoom: "fit",
    })).toEqual({
      width: 320,
      height: 180,
    })

    expect(fitPreviewStageSize({
      containerWidth: 320,
      containerHeight: 180,
      sourceWidth: 1920,
      sourceHeight: 1080,
      zoom: "150",
    })).toEqual({
      width: 480,
      height: 270,
    })
  })

  test("progressively hides secondary toolbar controls as the preview pane narrows", () => {
    expect(getPreviewPlayerControlLayout(720)).toMatchObject({
      density: "full",
      showLoopControl: true,
      showSpeedControl: true,
      showRestartControl: true,
      showFrameStepControls: true,
      showCaptionControl: true,
      showTimelineControl: true,
    })

    expect(getPreviewPlayerControlLayout(600)).toMatchObject({
      density: "balanced",
      showLoopControl: true,
      showSpeedControl: true,
      showRestartControl: false,
      showFrameStepControls: false,
      showCaptionControl: true,
      showTimelineControl: true,
    })

    expect(getPreviewPlayerControlLayout(500)).toMatchObject({
      density: "compact",
      showLoopControl: false,
      showSpeedControl: false,
      showMuteControl: true,
      showCaptionControl: false,
      showTimelineControl: false,
      showFullscreenControl: true,
    })

    expect(getPreviewPlayerControlLayout(360)).toMatchObject({
      density: "minimal",
      showMuteControl: false,
      showFullscreenControl: false,
    })
  })

  test("holds preview seek transitions until the player reports the requested time", () => {
    const baseReadiness = {
      requestedTime: 4,
      seekRequestId: 12,
      settledSeekRequestId: 11,
      isReady: true,
      isLoadingSource: false,
      isPreviewSourceFetching: false,
    }

    expect(
      shouldIssuePreviewSeekRequest({
        ...baseReadiness,
        issuedSeekRequestId: null,
        issuedSeekTime: null,
      }),
    ).toBe(true)
    expect(
      shouldIssuePreviewSeekRequest({
        ...baseReadiness,
        issuedSeekRequestId: 12,
        issuedSeekTime: 4,
      }),
    ).toBe(false)
    expect(
      shouldSettlePreviewSeekRequest({
        ...baseReadiness,
        currentTime: 0,
      }),
    ).toBe(false)
    expect(
      shouldSettlePreviewSeekRequest({
        ...baseReadiness,
        currentTime: 4.001,
      }),
    ).toBe(true)
  })

  test("holds the clicked target while a new preview source loads", () => {
    const hold = resolvePreviewNavigationHold({
      requestedTime: 4,
      seekRequestId: 12,
      settledSeekRequestId: 11,
      isReady: true,
      isLoadingSource: true,
      isPreviewSourceFetching: false,
      currentTime: 1.25,
      currentDuration: 8,
      settledDisplayTime: 1.25,
      settledDuration: 8,
    })

    expect(hold.hasPendingSeek).toBe(true)
    expect(hold.isPreviewSettling).toBe(true)
    expect(hold.seekTargetTime).toBe(4)
    expect(hold.displayTime).toBe(4)
    expect(hold.displayDuration).toBe(8)
    expect(hold.previewControlsReady).toBe(false)
    expect(hold.timelineInteractionsReady).toBe(false)
  })

  test("settles navigation against the clamped timestamp for shorter sources", () => {
    const hold = resolvePreviewNavigationHold({
      requestedTime: 12,
      seekRequestId: 13,
      settledSeekRequestId: 12,
      isReady: true,
      isLoadingSource: false,
      isPreviewSourceFetching: false,
      currentTime: 6,
      currentDuration: 6,
      settledDisplayTime: 9,
      settledDuration: 9,
    })

    expect(resolvePreviewSeekRequestTime({ requestedTime: 12, duration: 6 })).toBe(6)
    expect(hold.seekTargetTime).toBe(6)
    expect(hold.displayTime).toBe(6)
    expect(hold.displayDuration).toBe(6)
    expect(
      shouldSettlePreviewSeekRequest({
        requestedTime: hold.seekTargetTime,
        seekRequestId: 13,
        settledSeekRequestId: 12,
        isReady: true,
        isLoadingSource: false,
        isPreviewSourceFetching: false,
        currentTime: 6,
      }),
    ).toBe(true)
  })

  test("does not keep the scrubber disabled for non-blocking source refetches", () => {
    const hold = resolvePreviewNavigationHold({
      requestedTime: null,
      seekRequestId: undefined,
      settledSeekRequestId: null,
      isReady: true,
      isLoadingSource: false,
      isPreviewSourceFetching: true,
      currentTime: 3.25,
      currentDuration: 6,
      settledDisplayTime: 0,
      settledDuration: 0,
    })

    expect(hold.hasPendingSeek).toBe(false)
    expect(hold.isPreviewSettling).toBe(false)
    expect(hold.displayTime).toBe(3.25)
    expect(hold.previewControlsReady).toBe(true)
    expect(hold.timelineInteractionsReady).toBe(true)
  })

  test("can settle a landed seek even while the source query is refetching", () => {
    const readiness = {
      requestedTime: 3.25,
      seekRequestId: 14,
      settledSeekRequestId: 13,
      isReady: true,
      isLoadingSource: false,
      isPreviewSourceFetching: true,
    }

    expect(
      shouldIssuePreviewSeekRequest({
        ...readiness,
        issuedSeekRequestId: null,
        issuedSeekTime: null,
      }),
    ).toBe(true)
    expect(
      shouldSettlePreviewSeekRequest({
        ...readiness,
        currentTime: 3.25,
      }),
    ).toBe(true)
  })

  test("keeps preview seek handoffs pending through a paint cycle", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("scheduleSeekSettleAfterPaint")
    expect(source).toContain("canSettle: false")
    expect(source).toContain("!issuedSeek.canSettle")
    expect(source).toContain("window.requestAnimationFrame(() =>")
  })

  test("does not seek or settle preview transitions while the source is still loading", () => {
    const loadingReadiness = {
      requestedTime: 2,
      seekRequestId: 15,
      settledSeekRequestId: 14,
      isReady: true,
      isLoadingSource: true,
      isPreviewSourceFetching: false,
    }

    expect(
      shouldIssuePreviewSeekRequest({
        ...loadingReadiness,
        issuedSeekRequestId: null,
        issuedSeekTime: null,
      }),
    ).toBe(false)
    expect(
      shouldSettlePreviewSeekRequest({
        ...loadingReadiness,
        currentTime: 2,
      }),
    ).toBe(false)
  })

  test("keeps the preview time chip to one visible line", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain('data-testid="ripple-preview-frame-indicator"')
    expect(source).toContain('className="sr-only"')
    expect(source).not.toContain("showFrameLabel")
    expect(source).not.toContain("mt-0.5 text-[10px] tabular-nums text-muted-foreground")
  })

  test("wires responsive control density into the player toolbar", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("getPreviewPlayerControlLayout")
    expect(source).toContain("data-preview-control-density")
    expect(source).toContain("hasHiddenPlaybackControls")
    expect(source).toContain("hasHiddenViewControls")
    expect(source).toContain("<DropdownMenuLabel>Playback</DropdownMenuLabel>")
    expect(source).toContain("<DropdownMenuLabel>View</DropdownMenuLabel>")
    expect(source).not.toContain("mt-1.5 flex flex-wrap items-center gap-1.5")
  })

  test("captures the preview spacebar shortcut before focused controls consume it", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain('window.addEventListener("keydown", handlePreviewSpacebarKeyDown, true)')
    expect(source).toContain('event.stopImmediatePropagation()')
    expect(source).toContain('iframeWindow.addEventListener("keydown", handlePreviewSpacebarKeyDown, true)')
  })

  test("publishes the active preview surface for app-owned visual context", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("buildVisualPreviewSurfaceKey")
    expect(source).toContain("previewSurfaceRef")
    expect(source).toContain("updateVisualPreviewSurface")
    expect(source).toContain("clearVisualPreviewSurface")
    expect(source).toContain("sourceQuery.data?.projectPath")
  })

  test("delays transient preview loading indicators to avoid flicker", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("PREVIEW_BLOCKING_STATUS_DELAY_MS = 500")
    expect(source).toContain("useDelayedPreviewStatus")
    expect(source).toContain("showDelayedPreparingPreview")
    expect(source).toContain("fitPreviewStageSize")
    expect(source).toContain('className="flex min-h-[120px] flex-1')
    expect(source).not.toContain("Updating preview")
    expect(source).toContain("animate-in")
    expect(source).toContain("fade-in-0")
  })

  test("separates restart and reload transport semantics", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain('label={isPlaying ? "Pause preview" : "Play preview"}')
    expect(source).toContain('label="Restart preview"')
    expect(source).toContain("<RotateCcw")
    expect(source).toContain("Reload preview")
    expect(source).toContain("clearRipplePreviewCoordinator()")
    expect(source).toContain("handleReload")
  })

  test("keeps the timeline panel height stable across preview versions", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesTimeline.tsx",
      "utf8",
    )

    expect(source).toContain("TIMELINE_VIEWPORT_HEIGHT = 274")
    expect(source).toContain("Math.max(TIMELINE_VIEWPORT_HEIGHT, contentHeight)")
    expect(source).toContain('className="-mx-3 mt-1.5 h-[310px] overflow-hidden bg-background"')
    expect(source).toContain('className="relative h-[274px]"')
  })

  test("restores timeline scroll position before paint on composition switches", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesTimeline.tsx",
      "utf8",
    )
    const scrollRestoreStart = source.indexOf("useLayoutEffect(() => {\n    const scroll = scrollRef.current")
    const scrollRestoreEnd = source.indexOf("onSelectionChange?.(rangeSelection)", scrollRestoreStart)
    const scrollRestoreBlock = source.slice(scrollRestoreStart, scrollRestoreEnd)

    expect(scrollRestoreStart).toBeGreaterThan(-1)
    expect(scrollRestoreEnd).toBeGreaterThan(scrollRestoreStart)
    expect(scrollRestoreBlock).toContain("useLayoutEffect(() =>")
    expect(scrollRestoreBlock).toContain("pendingComfortScrollLeftRef.current")
    expect(scrollRestoreBlock).toContain("scroll.scrollLeft = pendingScrollLeft")
  })

  test("scrubs the extended timeline continuously while preserving shift range selection", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesTimeline.tsx",
      "utf8",
    )

    expect(source).toContain("isPlayheadScrubbing")
    expect(source).toContain("setIsPlayheadScrubbing(true)")
    expect(source).toContain("if (event.shiftKey)")
    expect(source).toContain("updateRangeSelection(time, time, null)")
    expect(source).toContain("if (isPlayheadScrubbing)")
    expect(source).toContain("if (time !== null) onSeek(time)")
  })

  test("keeps clip-edit commits from blocking or reloading the visible preview", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )
    const mutationStart = source.indexOf("const updateTimelineClipMutation")
    const mutationEnd = source.indexOf("const aspectRatio", mutationStart)
    const mutationBlock = source.slice(mutationStart, mutationEnd)

    expect(mutationStart).toBeGreaterThan(-1)
    expect(mutationEnd).toBeGreaterThan(mutationStart)
    expect(mutationBlock).toContain("setTimelineEditModel(result.model)")
    expect(mutationBlock).toContain("getTimelineModel.setData")
    expect(mutationBlock).not.toContain("adapter.reload")
    expect(readFileSync(
      "src/renderer/features/hyperframes/HyperFramesTimeline.tsx",
      "utf8",
    )).toContain("pl-4 pr-3")
  })

  test("uses Studio-style single-lane track rendering", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesTimeline.tsx",
      "utf8",
    )

    expect(source).toContain("const GUTTER_WIDTH = 32")
    expect(source).toContain("const RULER_HEIGHT = 24")
    expect(source).toContain("const TRACK_HEIGHT = 72")
    expect(source).toContain("const CLIP_INSET = 3")
    expect(source).toContain("const MIN_CLIP_WIDTH = 4")
    expect(source).toContain("height: TRACK_HEIGHT - CLIP_INSET * 2")
    expect(source).not.toContain("layoutTimelineTrackClips")
    expect(source).not.toContain("CLIP_SUBLANE_GAP")
    expect(source).not.toContain("data-overlapping-clip")
  })

  test("allows a plain spacebar press to toggle playback on the preview surface and controls", () => {
    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: neutralShortcutTarget(),
      }),
    ).toBe(true)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: "Spacebar",
        target: neutralShortcutTarget(),
      }),
    ).toBe(true)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: targetMatchingSelector("button"),
      }),
    ).toBe(true)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: targetMatchingSelector("[role='slider']"),
      }),
    ).toBe(true)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        defaultPrevented: true,
        target: neutralShortcutTarget(),
      }),
    ).toBe(true)
  })

  test("does not toggle playback while text entry owns the spacebar", () => {
    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: targetMatchingSelector("textarea"),
      }),
    ).toBe(false)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: inputShortcutTarget("text"),
      }),
    ).toBe(false)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: inputShortcutTarget("checkbox"),
      }),
    ).toBe(true)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: targetMatchingSelector("[data-preview-spacebar-ignore]"),
      }),
    ).toBe(false)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: { isContentEditable: true } as unknown as EventTarget,
      }),
    ).toBe(false)
  })

  test("ignores repeats, modified keys, and non-space keys", () => {
    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        repeat: true,
        target: neutralShortcutTarget(),
      }),
    ).toBe(false)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        metaKey: true,
        target: neutralShortcutTarget(),
      }),
    ).toBe(false)

    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: "Enter",
        code: "Enter",
        target: neutralShortcutTarget(),
      }),
    ).toBe(false)
  })
})
