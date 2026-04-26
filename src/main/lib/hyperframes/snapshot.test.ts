import { describe, expect, test } from "bun:test"
import { getChangedSnapshotFiles } from "./snapshot"

describe("HyperFrames snapshot artifacts", () => {
  test("returns new and rewritten snapshot files", () => {
    const before = new Map([
      ["frame-00-at-0pct.png", { mtimeMs: 100, size: 12 }],
      ["frame-01-at-100pct.png", { mtimeMs: 100, size: 24 }],
    ])
    const after = new Map([
      ["frame-00-at-0pct.png", { mtimeMs: 200, size: 12 }],
      ["frame-01-at-100pct.png", { mtimeMs: 100, size: 24 }],
      ["frame-02-at-50pct.png", { mtimeMs: 200, size: 36 }],
    ])

    expect(getChangedSnapshotFiles(before, after)).toEqual([
      "frame-00-at-0pct.png",
      "frame-02-at-50pct.png",
    ])
  })

  test("falls back to existing artifacts when the CLI reports success in place", () => {
    const before = new Map([
      ["frame-00-at-0pct.png", { mtimeMs: 100, size: 12 }],
    ])
    const after = new Map([
      ["frame-00-at-0pct.png", { mtimeMs: 100, size: 12 }],
    ])

    expect(getChangedSnapshotFiles(before, after)).toEqual([
      "frame-00-at-0pct.png",
    ])
  })
})
