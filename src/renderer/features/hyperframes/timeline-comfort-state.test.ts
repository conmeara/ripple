import { describe, expect, test } from "bun:test"
import {
  DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE,
  loadRippleTimelineComfortState,
  normalizeRippleTimelineComfortState,
  rippleTimelineComfortStorageKey,
  saveRippleTimelineComfortState,
} from "./timeline-comfort-state"

class TestStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  clear() {
    this.values.clear()
  }
}

const localStorage = new TestStorage()
Object.assign(globalThis, {
  window: { localStorage },
})

describe("timeline comfort state", () => {
  test("keys comfort by project and composition", () => {
    expect(rippleTimelineComfortStorageKey("project-1", "composition-1")).toBe(
      "ripple-timeline-comfort:project-1:composition-1",
    )
  })

  test("normalizes missing or invalid state to defaults", () => {
    expect(normalizeRippleTimelineComfortState(null)).toEqual(
      DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE,
    )
    expect(normalizeRippleTimelineComfortState({
      zoomMode: "strange",
      manualZoomPercent: Number.NaN,
      scrollLeft: -50,
    })).toEqual(DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE)
  })

  test("clamps manual zoom and scroll values", () => {
    expect(normalizeRippleTimelineComfortState({
      zoomMode: "manual",
      manualZoomPercent: 5000,
      scrollLeft: 42.4,
    })).toEqual({
      zoomMode: "manual",
      manualZoomPercent: 800,
      scrollLeft: 42,
    })

    expect(normalizeRippleTimelineComfortState({
      zoomMode: "manual",
      manualZoomPercent: 1,
      scrollLeft: 10,
    })).toEqual({
      zoomMode: "manual",
      manualZoomPercent: 25,
      scrollLeft: 10,
    })
  })

  test("round-trips saved state through localStorage", () => {
    localStorage.clear()

    saveRippleTimelineComfortState("project-1", "composition-1", {
      zoomMode: "manual",
      manualZoomPercent: 220,
      scrollLeft: 410,
    })

    expect(loadRippleTimelineComfortState("project-1", "composition-1")).toEqual({
      zoomMode: "manual",
      manualZoomPercent: 220,
      scrollLeft: 410,
    })
  })

  test("isolates comfort state per composition", () => {
    localStorage.clear()

    saveRippleTimelineComfortState("project-1", "composition-a", {
      zoomMode: "manual",
      manualZoomPercent: 180,
      scrollLeft: 200,
    })
    saveRippleTimelineComfortState("project-1", "composition-b", {
      zoomMode: "fit",
      manualZoomPercent: 125,
      scrollLeft: 0,
    })

    expect(loadRippleTimelineComfortState("project-1", "composition-a")).toEqual({
      zoomMode: "manual",
      manualZoomPercent: 180,
      scrollLeft: 200,
    })
    expect(loadRippleTimelineComfortState("project-1", "composition-b")).toEqual({
      zoomMode: "fit",
      manualZoomPercent: 125,
      scrollLeft: 0,
    })
  })

  test("falls back to defaults for malformed saved state", () => {
    localStorage.clear()
    localStorage.setItem(
      rippleTimelineComfortStorageKey("project-1", "composition-1"),
      "{not-json",
    )

    expect(loadRippleTimelineComfortState("project-1", "composition-1")).toEqual(
      DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE,
    )
  })
})
