import { describe, expect, test } from "bun:test"
import {
  PREVIEW_SETTINGS_CONTROLS,
  ZOOM_OPTIONS,
  shouldRenderPreviewCloseControl,
} from "./preview-player-controls"

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
})
