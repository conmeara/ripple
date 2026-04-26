import { describe, expect, test } from "bun:test"
import {
  buildTimelineRangeSelection,
  filterTimelineDisplayClips,
  formatTimelineTimecode,
  generateTimelineTicks,
  getTimelineFitPixelsPerSecond,
  getTimelinePixelsPerSecond,
  getTimelinePlayheadLeft,
  groupTimelineClipsByTrack,
  normalizeRuntimeTimelineManifest,
  type RippleTimelineClip,
} from "../../../shared/hyperframes-timeline-model"

function clip(overrides: Partial<RippleTimelineClip> = {}): RippleTimelineClip {
  return {
    id: "clip",
    key: "index.html:clip:0",
    label: "Clip",
    kind: "element",
    tagName: "div",
    start: 0,
    duration: 1,
    track: 0,
    sourceFile: "index.html",
    editable: false,
    confidence: "static",
    ...overrides,
  }
}

describe("Ripple timeline model utilities", () => {
  test("normalizes runtime manifests into authoritative clip models", () => {
    const model = normalizeRuntimeTimelineManifest({
      context: {
        projectId: "project_1",
        compositionId: "composition_1",
        filePath: "index.html",
        width: 1920,
        height: 1080,
      },
      manifest: {
        durationInFrames: 180,
        scenes: [{ id: "intro", label: "Intro", start: 0, duration: 6 }],
        clips: [
          {
            id: "__node__index_1",
            label: "Node Index 1",
            kind: "element",
            tagName: "section",
            start: 0,
            duration: 6,
            track: 1,
          },
          {
            id: "title",
            label: "Title",
            kind: "element",
            tagName: "h1",
            start: 0.2,
            duration: 4,
            track: 2,
          },
          {
            id: "nested-child",
            label: "Nested child",
            kind: "element",
            tagName: "p",
            start: 0,
            duration: 2,
            track: 1,
            parentCompositionId: "lower-third",
          },
          {
            id: "__node__index_4",
            label: "Node Index 4",
            kind: "element",
            tagName: "div",
            start: 2.4,
            duration: 3.2,
            track: 3,
          },
          {
            id: "lower-third",
            label: "lower-third",
            kind: "composition",
            tagName: "div",
            compositionId: "lower-third",
            compositionSrc: "compositions/lower-third.html",
            start: 2.4,
            duration: 3.2,
            track: 4,
          },
        ],
      },
    })

    expect(model?.source).toBe("runtime-manifest")
    expect(model?.durationSeconds).toBe(6)
    expect(model?.durationFrames).toBe(180)
    expect(model?.clips).toHaveLength(3)
    expect(model?.clips.map((runtimeClip) => runtimeClip.label)).toEqual([
      "Node Index 1",
      "Title",
      "lower-third",
    ])
    expect(model?.clips.map((runtimeClip) => runtimeClip.confidence)).toEqual([
      "authoritative",
      "authoritative",
      "authoritative",
    ])
    expect(model?.clips.at(-1)?.compositionSrc).toBe("compositions/lower-third.html")
    expect(model?.scenes[0]?.label).toBe("Intro")
  })

  test("clips runtime data to the manifest duration and honors custom fps", () => {
    const model = normalizeRuntimeTimelineManifest({
      context: {
        projectId: "project_1",
        compositionId: "composition_1",
        filePath: "index.html",
        width: 1080,
        height: 1080,
        fps: 60,
      },
      manifest: {
        durationInFrames: 120,
        scenes: [
          { id: "valid", label: "Valid", start: 0, duration: 2 },
          { id: "invalid", label: "Invalid", start: 2, duration: 0 },
        ],
        clips: [
          {
            id: "late-title",
            label: "Late title",
            kind: "unknown-kind",
            tagName: "h1",
            start: 1.5,
            duration: 2,
            track: 2,
          },
          {
            id: "after-end",
            label: "After end",
            kind: "element",
            tagName: "p",
            start: 2,
            duration: 1,
            track: 3,
          },
        ],
      },
    })

    expect(model?.fps).toBe(60)
    expect(model?.durationSeconds).toBe(2)
    expect(model?.durationFrames).toBe(120)
    expect(model?.clips).toHaveLength(1)
    expect(model?.clips[0]?.duration).toBe(0.5)
    expect(model?.clips[0]?.kind).toBe("element")
    expect(model?.scenes.map((scene) => scene.id)).toEqual(["valid"])
    expect(formatTimelineTimecode(model?.clips[0]?.start ?? 0, model?.fps)).toBe("00:00:01:30")
  })

  test("returns null for runtime manifests without usable clips or duration", () => {
    const model = normalizeRuntimeTimelineManifest({
      context: {
        projectId: "project_1",
        compositionId: "composition_1",
        filePath: "index.html",
        width: 1920,
        height: 1080,
      },
      manifest: {
        clips: [{ id: "zero", start: 0, duration: 0 }],
      },
    })

    expect(model).toBeNull()
  })

  test("filters generic composition host duplicates without losing real nodes", () => {
    const clips = filterTimelineDisplayClips([
      clip({
        key: "index.html:generic:0",
        id: "__node__index_4",
        label: "Node Index 4",
        tagName: "div",
        start: 2,
        duration: 3,
        track: 2,
        compositionId: "lower-third",
      }),
      clip({
        key: "index.html:lower-third:1",
        id: "lower-third",
        label: "lower-third",
        kind: "composition",
        tagName: "div",
        start: 2,
        duration: 3,
        track: 3,
        compositionId: "lower-third",
        compositionSrc: "compositions/lower-third.html",
      }),
      clip({
        key: "index.html:generic-title:2",
        id: "__node__index_2",
        label: "Node Index 2",
        tagName: "h1",
        start: 0,
        duration: 2,
        track: 1,
      }),
    ])

    expect(clips.map((timelineClip) => timelineClip.key)).toEqual([
      "index.html:generic-title:2",
      "index.html:lower-third:1",
    ])
  })

  test("groups clips by track and keeps each track sorted by start time", () => {
    const tracks = groupTimelineClipsByTrack([
      clip({ key: "track-2-late", track: 2, start: 4, label: "Late" }),
      clip({ key: "track-1", track: 1, start: 1, label: "Middle" }),
      clip({ key: "track-2-early", track: 2, start: 0, label: "Early" }),
    ])

    expect(tracks.map((track) => track.track)).toEqual([1, 2])
    expect(tracks[1]?.clips.map((trackClip) => trackClip.label)).toEqual([
      "Early",
      "Late",
    ])
  })

  test("generates bounded ruler ticks for short compositions", () => {
    const ticks = generateTimelineTicks(6)

    expect(ticks.major[0]).toBe(0)
    expect(ticks.major).toContain(6)
    expect(ticks.minor.length).toBeGreaterThan(0)
  })

  test("calculates fit/manual zoom and playhead position from one source of truth", () => {
    const fit = getTimelineFitPixelsPerSecond({
      duration: 6,
      viewportWidth: 712,
      gutterWidth: 112,
      minimum: 40,
    })
    const manual = getTimelinePixelsPerSecond({
      fitPixelsPerSecond: fit,
      zoomMode: "manual",
      manualZoomPercent: 200,
    })

    expect(fit).toBe(100)
    expect(manual).toBe(200)
    expect(getTimelinePlayheadLeft({
      time: 2,
      pixelsPerSecond: manual,
      gutterWidth: 112,
    })).toBe(512)
  })

  test("lets fit mode shrink long timelines into the visible viewport", () => {
    const fit = getTimelineFitPixelsPerSecond({
      duration: 30,
      viewportWidth: 700,
      gutterWidth: 36,
      trailingPadding: 24,
    })

    expect(fit).toBeCloseTo(21.333, 3)
    expect(36 + 30 * fit + 24).toBeCloseTo(700, 3)
  })

  test("builds frame-anchored selection data for later comments", () => {
    const selection = buildTimelineRangeSelection({
      projectId: "project_1",
      compositionId: "composition_1",
      source: "runtime-manifest",
      confidence: "authoritative",
      startTime: 3,
      endTime: 1,
      clip: clip({
        key: "index.html:#title:0",
        selector: "#title",
        sourceFile: "index.html",
        confidence: "authoritative",
      }),
    })

    expect(selection.startTime).toBe(1)
    expect(selection.endTime).toBe(3)
    expect(selection.startFrame).toBe(30)
    expect(selection.endFrame).toBe(90)
    expect(selection.clipKey).toBe("index.html:#title:0")
    expect(selection.selector).toBe("#title")
  })
})
