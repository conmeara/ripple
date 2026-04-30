import { describe, expect, test } from "bun:test"
import {
  normalizeRipplePreviewTime,
  shouldIgnorePendingRipplePreviewTimeUpdate,
  shouldKeepStickyRipplePreviewTime,
} from "./ripple-preview-time"

describe("Ripple preview time", () => {
  test("preserves sub-second comment anchors and exact frame seconds", () => {
    expect(normalizeRipplePreviewTime(3.001)).toBe(3.001)
    expect(normalizeRipplePreviewTime(91 / 30)).toBe(91 / 30)
  })

  test("clamps invalid preview time to the start", () => {
    expect(normalizeRipplePreviewTime(-1)).toBe(0)
    expect(normalizeRipplePreviewTime(Number.NaN)).toBe(0)
    expect(normalizeRipplePreviewTime(null)).toBe(0)
  })

  test("keeps sticky time through tiny player rounding drift", () => {
    expect(
      shouldKeepStickyRipplePreviewTime({
        currentTime: 3.001,
        incomingTime: 3,
      }),
    ).toBe(true)
    expect(
      shouldKeepStickyRipplePreviewTime({
        currentTime: 91 / 30,
        incomingTime: 3.033,
      }),
    ).toBe(true)
    expect(
      shouldKeepStickyRipplePreviewTime({
        currentTime: 3,
        incomingTime: 3.05,
      }),
    ).toBe(false)
  })

  test("ignores loader zeroes while a non-zero seek is pending", () => {
    expect(
      shouldIgnorePendingRipplePreviewTimeUpdate({
        pendingSeekTime: 91 / 30,
        incomingTime: 0,
      }),
    ).toBe(true)
    expect(
      shouldIgnorePendingRipplePreviewTimeUpdate({
        pendingSeekTime: 91 / 30,
        incomingTime: 91 / 30,
      }),
    ).toBe(false)
    expect(
      shouldIgnorePendingRipplePreviewTimeUpdate({
        pendingSeekTime: 0,
        incomingTime: 0,
      }),
    ).toBe(false)
  })
})
