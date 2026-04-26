import { describe, expect, test } from "bun:test"
import { resolvePreviewSeekRatio } from "./preview-scrubber"

describe("HyperFrames preview scrubber", () => {
  test("resolves pointer position from the scrubber bounds", () => {
    expect(resolvePreviewSeekRatio({
      clientX: 150,
      rectLeft: 100,
      rectWidth: 200,
    })).toBe(0.25)
  })

  test("clamps and snaps near the timeline edges like HyperFrames controls", () => {
    expect(resolvePreviewSeekRatio({
      clientX: 105,
      rectLeft: 100,
      rectWidth: 200,
    })).toBe(0)
    expect(resolvePreviewSeekRatio({
      clientX: 296,
      rectLeft: 100,
      rectWidth: 200,
    })).toBe(1)
    expect(resolvePreviewSeekRatio({
      clientX: 40,
      rectLeft: 100,
      rectWidth: 200,
    })).toBe(0)
    expect(resolvePreviewSeekRatio({
      clientX: 360,
      rectLeft: 100,
      rectWidth: 200,
    })).toBe(1)
  })

  test("returns zero for unusable scrubber geometry", () => {
    expect(resolvePreviewSeekRatio({
      clientX: 150,
      rectLeft: 100,
      rectWidth: 0,
    })).toBe(0)
    expect(resolvePreviewSeekRatio({
      clientX: 150,
      rectLeft: 100,
      rectWidth: Number.NaN,
    })).toBe(0)
  })
})
