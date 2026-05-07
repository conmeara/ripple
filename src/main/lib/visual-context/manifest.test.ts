import { describe, expect, test } from "bun:test"
import { buildFrameSheetManifest } from "./manifest"

describe("visual context frame-sheet manifest", () => {
  test("builds stable project-relative sheet and sample paths", () => {
    expect(buildFrameSheetManifest({
      id: "fs_test",
      rangeMs: [2000, 4000],
      fps: 24,
      columns: 3,
      rows: 1,
      finalRelativeRoot: ".ripple/frame-sheets/fs_test",
      timestampsMs: [2000, 3000, 4000],
    })).toEqual({
      version: 1,
      id: "fs_test",
      kind: "frame_sheet",
      projectDir: ".",
      rangeMs: [2000, 4000],
      fps: 24,
      columns: 3,
      rows: 1,
      sheetPath: ".ripple/frame-sheets/fs_test/sheet.png",
      samples: [
        {
          index: 0,
          timeMs: 2000,
          frame: 48,
          path: ".ripple/frame-sheets/fs_test/frames/000.png",
        },
        {
          index: 1,
          timeMs: 3000,
          frame: 72,
          path: ".ripple/frame-sheets/fs_test/frames/001.png",
        },
        {
          index: 2,
          timeMs: 4000,
          frame: 96,
          path: ".ripple/frame-sheets/fs_test/frames/002.png",
        },
      ],
    })
  })

  test("keeps explicit timestamp manifests range-less", () => {
    expect(buildFrameSheetManifest({
      id: "fs_at",
      rangeMs: null,
      fps: 30,
      columns: 2,
      rows: 1,
      finalRelativeRoot: ".ripple/frame-sheets/fs_at",
      timestampsMs: [0, 1250],
    }).samples.map((sample) => ({
      timeMs: sample.timeMs,
      frame: sample.frame,
      path: sample.path,
    }))).toEqual([
      {
        timeMs: 0,
        frame: 0,
        path: ".ripple/frame-sheets/fs_at/frames/000.png",
      },
      {
        timeMs: 1250,
        frame: 38,
        path: ".ripple/frame-sheets/fs_at/frames/001.png",
      },
    ])
  })
})
