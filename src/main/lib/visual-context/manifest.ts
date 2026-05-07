import { frameForTime } from "./sampling"

export interface FrameSheetSample {
  index: number
  timeMs: number
  frame: number
  path: string
}

export interface FrameSheetManifest {
  version: 1
  id: string
  kind: "frame_sheet"
  projectDir: "."
  rangeMs: [number, number] | null
  fps: number
  columns: number
  rows: number
  sheetPath: string
  samples: FrameSheetSample[]
}

export function buildFrameSheetManifest(input: {
  id: string
  rangeMs: [number, number] | null
  fps: number
  columns: number
  rows: number
  finalRelativeRoot: string
  timestampsMs: number[]
}): FrameSheetManifest {
  return {
    version: 1,
    id: input.id,
    kind: "frame_sheet",
    projectDir: ".",
    rangeMs: input.rangeMs,
    fps: input.fps,
    columns: input.columns,
    rows: input.rows,
    sheetPath: `${input.finalRelativeRoot}/sheet.png`,
    samples: input.timestampsMs.map((timeMs, index) => ({
      index,
      timeMs,
      frame: frameForTime(timeMs, input.fps),
      path: `${input.finalRelativeRoot}/frames/${String(index).padStart(3, "0")}.png`,
    })),
  }
}
