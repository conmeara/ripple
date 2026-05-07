import { describe, expect, test } from "bun:test"
import {
  buildFrameSheetSummary,
  frameForTime,
  getFrameSheetColumns,
  resolveFrameSheetTimestamps,
} from "./sampling"

describe("visual context frame-sheet sampling", () => {
  test("sorts and dedupes explicit timestamps", () => {
    expect(resolveFrameSheetTimestamps({
      at: [3000, 1000, 1000, 1500],
      range: null,
      samples: null,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    })).toEqual({
      timestampsMs: [1000, 1500, 3000],
      rangeMs: null,
    })
  })

  test("samples ranges by count, time interval, and frame interval", () => {
    expect(resolveFrameSheetTimestamps({
      at: null,
      range: [2000, 8000],
      samples: 4,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    }).timestampsMs).toEqual([2000, 4000, 6000, 8000])

    expect(resolveFrameSheetTimestamps({
      at: null,
      range: [0, 3000],
      samples: null,
      everyMs: 1000,
      everyFrames: null,
      fps: 30,
    }).timestampsMs).toEqual([0, 1000, 2000, 3000])

    expect(resolveFrameSheetTimestamps({
      at: null,
      range: [0, 1000],
      samples: null,
      everyMs: null,
      everyFrames: 15,
      fps: 30,
    }).timestampsMs).toEqual([0, 500, 1000])
  })

  test("enforces sample and column bounds", () => {
    expect(() => resolveFrameSheetTimestamps({
      at: null,
      range: [0, 12_000],
      samples: 13,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    })).toThrow("capped")

    expect(() => getFrameSheetColumns(4, 5)).toThrow("between 1 and 4")
  })

  test("builds frame metadata consistently", () => {
    expect(frameForTime(1250, 24)).toBe(30)
    expect(getFrameSheetColumns(2, null)).toBe(2)
    expect(getFrameSheetColumns(8, null)).toBe(4)
    expect(buildFrameSheetSummary([0, 1000])).toBe("Frame sheet with 2 samples from 0s to 1s.")
  })
})
