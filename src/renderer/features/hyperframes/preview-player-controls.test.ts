import { describe, expect, test } from "bun:test"
import {
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
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
