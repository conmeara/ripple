import { describe, expect, test } from "bun:test"
import {
  isRuntimeStateMessage,
  isRuntimeTimelineMessage,
  readClipManifest,
  readLivePlaybackDuration,
  readLivePlaybackPlaying,
  readLivePlaybackTime,
  resolvePlaybackAdapter,
  safeDuration,
  safeTime,
} from "./timeline-player-adapter-core"

function timeline(time: number, duration: number, active: boolean) {
  return {
    time: () => time,
    duration: () => duration,
    isActive: () => active,
  }
}

function player(overrides: Record<string, unknown> = {}) {
  return {
    currentTime: 1.25,
    duration: 6,
    paused: false,
    ...overrides,
  } as any
}

describe("Ripple timeline player adapter core", () => {
  test("sanitizes player time and duration values", () => {
    expect(safeTime(0)).toBe(0)
    expect(safeTime(1.5)).toBe(1.5)
    expect(safeTime(-1)).toBe(0)
    expect(safeTime(Number.NaN)).toBe(0)

    expect(safeDuration(6)).toBe(6)
    expect(safeDuration(0)).toBe(0)
    expect(safeDuration(7200)).toBe(0)
    expect(safeDuration(Number.POSITIVE_INFINITY)).toBe(0)
  })

  test("identifies only HyperFrames runtime timeline and state messages", () => {
    expect(isRuntimeTimelineMessage({
      source: "hf-preview",
      type: "timeline",
      clips: [],
    })).toBe(true)
    expect(isRuntimeTimelineMessage({
      source: "hf-preview",
      type: "timeline",
      clips: "not-an-array",
    })).toBe(false)
    expect(isRuntimeTimelineMessage({
      source: "other",
      type: "timeline",
      clips: [],
    })).toBe(false)

    expect(isRuntimeStateMessage({ source: "hf-preview", type: "state" })).toBe(true)
    expect(isRuntimeStateMessage({ source: "hf-preview", type: "timeline" })).toBe(false)
  })

  test("prefers the HyperFrames __player clock over public player fields", () => {
    const adapter = {
      getTime: () => 2.5,
      getDuration: () => 8,
      isPlaying: () => true,
    }
    const runtimePlayer = player({
      currentTime: 1,
      duration: 6,
      paused: true,
      iframeElement: { contentWindow: { __player: adapter } },
    })

    expect(resolvePlaybackAdapter(runtimePlayer)).toBe(adapter)
    expect(readLivePlaybackTime(runtimePlayer)).toBe(2.5)
    expect(readLivePlaybackDuration(runtimePlayer)).toBe(8)
    expect(readLivePlaybackPlaying(runtimePlayer)).toBe(true)
  })

  test("selects the root HyperFrames timeline when multiple runtime timelines exist", () => {
    const rootTimeline = timeline(3, 9, true)
    const otherTimeline = timeline(1, 4, false)
    const runtimePlayer = player({
      iframeElement: {
        contentWindow: {
          __timelines: {
            intro: otherTimeline,
            main: rootTimeline,
          },
        },
        contentDocument: {
          querySelector: () => ({
            getAttribute: () => "main",
          }),
        },
      },
    })

    expect(readLivePlaybackTime(runtimePlayer)).toBe(3)
    expect(readLivePlaybackDuration(runtimePlayer)).toBe(9)
    expect(readLivePlaybackPlaying(runtimePlayer)).toBe(true)
  })

  test("falls back to public player fields when iframe runtime access is unavailable", () => {
    const runtimePlayer = player({
      currentTime: 4,
      duration: 10,
      paused: true,
    })

    expect(resolvePlaybackAdapter(runtimePlayer)).toBeNull()
    expect(readLivePlaybackTime(runtimePlayer)).toBe(4)
    expect(readLivePlaybackDuration(runtimePlayer)).toBe(10)
    expect(readLivePlaybackPlaying(runtimePlayer)).toBe(false)
  })

  test("guards runtime manifest reads when iframe access throws", () => {
    const iframeElement = Object.defineProperty({}, "contentWindow", {
      get() {
        throw new Error("cross-origin")
      },
    })

    expect(readClipManifest(player({ iframeElement }))).toBeNull()
    expect(readLivePlaybackTime(player({ iframeElement, currentTime: 1.75 }))).toBe(1.75)
  })

  test("reads runtime clip manifests only when clips are present", () => {
    expect(readClipManifest(player({
      iframeElement: {
        contentWindow: {
          __clipManifest: {
            clips: [{ id: "title", start: 0, duration: 1 }],
          },
        },
      },
    }))?.clips?.[0]?.id).toBe("title")

    expect(readClipManifest(player({
      iframeElement: {
        contentWindow: {
          __clipManifest: {
            clips: null,
          },
        },
      },
    }))).toBeNull()
  })
})
