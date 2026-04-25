import { describe, expect, test } from "bun:test"
import { aspectRatioPresets, defaultRippleProjectSettings } from "./types"

describe("Ripple project types", () => {
  test("keeps aspect ratio presets aligned with tRPC input options", () => {
    expect(aspectRatioPresets).toEqual([
      "wide-16-9",
      "square-1-1",
      "vertical-9-16",
    ])
  })

  test("uses a 1080p 30fps default starter", () => {
    expect(defaultRippleProjectSettings).toEqual({
      aspectRatioPreset: "wide-16-9",
      width: 1920,
      height: 1080,
      fps: 30,
    })
  })
})
