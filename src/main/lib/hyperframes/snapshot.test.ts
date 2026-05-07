import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildFastSnapshotFileName,
  getChangedSnapshotFiles,
  readSnapshotMetadata,
  resolveSnapshotTimestampsSeconds,
} from "./snapshot"

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

  test("resolves fast snapshot timestamps without a HyperFrames CLI probe when duration is known", () => {
    expect(resolveSnapshotTimestampsSeconds({
      at: [1.25, 0],
      frames: 3,
      durationSeconds: null,
    })).toEqual([1.25, 0])

    expect(resolveSnapshotTimestampsSeconds({
      frames: 3,
      durationSeconds: 2,
    })).toEqual([0, 1, 2])

    expect(resolveSnapshotTimestampsSeconds({
      frames: 1,
      durationSeconds: 2,
    })).toEqual([1])

    expect(resolveSnapshotTimestampsSeconds({
      frames: 5,
      durationSeconds: null,
    })).toBeNull()
  })

  test("keeps explicit fast snapshot filenames precise and collision-resistant", () => {
    expect(buildFastSnapshotFileName({
      index: 0,
      timeSeconds: 1.25,
      explicitAt: true,
    })).toBe("frame-00-at-1.25s.png")

    expect(buildFastSnapshotFileName({
      index: 1,
      timeSeconds: 0.5,
      durationSeconds: 2,
      explicitAt: false,
    })).toBe("frame-01-at-25pct.png")
  })

  test("reads entry duration from HTML when the manifest omits duration", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-snapshot-metadata-"))
    try {
      await writeFile(join(projectPath, "hyperframes.json"), JSON.stringify({
        entry: "index.html",
      }))
      await writeFile(
        join(projectPath, "index.html"),
        '<main data-composition-id="main" data-duration="1.5"></main>',
      )

      await expect(readSnapshotMetadata({
        key: "project:test",
        projectId: "test",
        project: {} as any,
        projectPath,
      })).resolves.toEqual({
        entry: "index.html",
        durationSeconds: 1.5,
      })
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
