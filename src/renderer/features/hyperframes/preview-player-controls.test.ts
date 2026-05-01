import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  formatPreviewTimecode,
  shouldRenderPreviewCloseControl,
  shouldTogglePreviewPlaybackForSpacebar,
} from "./preview-player-controls"

function targetMatchingShortcutSelector(): EventTarget {
  return {
    closest: () => ({}),
  } as unknown as EventTarget
}

function neutralShortcutTarget(): EventTarget {
  return {
    closest: () => null,
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

  test("delays transient preview loading indicators to avoid flicker", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("PREVIEW_BLOCKING_STATUS_DELAY_MS = 500")
    expect(source).toContain("useDelayedPreviewStatus")
    expect(source).toContain("showDelayedPreparingPreview")
    expect(source).not.toContain("Updating preview")
    expect(source).toContain("animate-in")
    expect(source).toContain("fade-in-0")
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

  test("allows a plain spacebar press to toggle playback on the preview surface", () => {
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
  })

  test("does not toggle playback while text or interactive controls own the spacebar", () => {
    expect(
      shouldTogglePreviewPlaybackForSpacebar({
        key: " ",
        code: "Space",
        target: targetMatchingShortcutSelector(),
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

  test("ignores repeats, modified keys, handled events, and non-space keys", () => {
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
        key: " ",
        code: "Space",
        defaultPrevented: true,
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
