import { describe, expect, test } from "bun:test"
import {
  assembleFrameSheetWithFfmpeg,
  buildFrameSheetFfmpegArgs,
} from "./sheet-assembly"

describe("visual context frame-sheet assembly", () => {
  test("builds deterministic FFmpeg tile arguments", () => {
    expect(buildFrameSheetFfmpegArgs({
      framesDir: "/tmp/frames",
      outputPath: "/tmp/sheet.png",
      columns: 4,
      rows: 2,
      maxSheetWidth: 1440,
    })).toEqual([
      "-y",
      "-framerate",
      "1",
      "-i",
      "/tmp/frames/%03d.png",
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-2:force_original_aspect_ratio=decrease,tile=4x2",
      "/tmp/sheet.png",
    ])
  })

  test("tries command candidates until one succeeds", async () => {
    const attempts: string[] = []
    await assembleFrameSheetWithFfmpeg({
      framesDir: "/tmp/frames",
      outputPath: "/tmp/sheet.png",
      columns: 3,
      rows: 1,
      maxSheetWidth: 960,
      env: {},
      commandCandidates: ["bad-ffmpeg", "good-ffmpeg"],
      execFile: async (file, args, options) => {
        attempts.push(`${file}:${args.at(-1)}:${options.timeout}`)
        if (file === "bad-ffmpeg") throw new Error("nope")
      },
    })

    expect(attempts).toEqual([
      "bad-ffmpeg:/tmp/sheet.png:30000",
      "good-ffmpeg:/tmp/sheet.png:30000",
    ])
  })

  test("throws a visual context error when every candidate fails", async () => {
    await expect(assembleFrameSheetWithFfmpeg({
      framesDir: "/tmp/frames",
      outputPath: "/tmp/sheet.png",
      columns: 1,
      rows: 1,
      maxSheetWidth: 10,
      env: {},
      commandCandidates: ["ffmpeg"],
      execFile: async () => {
        throw new Error("missing binary")
      },
    })).rejects.toThrow("missing binary")
  })
})
