import { VisualContextError } from "./errors"

export const DEFAULT_FRAME_SHEET_FPS = 30
export const DEFAULT_FRAME_SHEET_SAMPLES = 8
export const MAX_FRAME_SHEET_SAMPLES = 12

export interface VisualFrameSheetSamplingInput {
  at: number[] | null
  range: [number, number] | null
  samples: number | null
  everyMs: number | null
  everyFrames: number | null
  fps: number
}

export interface VisualFrameSheetSamplingResult {
  timestampsMs: number[]
  rangeMs: [number, number] | null
}

function dedupeSorted(times: number[]): number[] {
  return Array.from(new Set(times.map((time) => Math.round(time)))).sort((a, b) => a - b)
}

function validateSampleCount(times: number[]): number[] {
  if (times.length === 0) {
    throw new VisualContextError("EMPTY_SAMPLES", "Frame sheet needs at least one timestamp.")
  }
  if (times.length > MAX_FRAME_SHEET_SAMPLES) {
    throw new VisualContextError(
      "TOO_MANY_SAMPLES",
      `Frame sheets are capped at ${MAX_FRAME_SHEET_SAMPLES} samples.`,
    )
  }
  return times
}

function timestampsForSampleCount(start: number, end: number, samples: number): number[] {
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new VisualContextError("INVALID_NUMBER", "--samples must be a positive integer.")
  }
  if (samples === 1 || start === end) return [start]

  const step = (end - start) / (samples - 1)
  return Array.from({ length: samples }, (_value, index) =>
    Math.round(start + step * index),
  )
}

function timestampsForInterval(start: number, end: number, intervalMs: number): number[] {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new VisualContextError("INVALID_INTERVAL", "Sample interval must be greater than zero.")
  }

  const times: number[] = []
  for (let current = start; current <= end; current += intervalMs) {
    times.push(Math.round(current))
    if (times.length > MAX_FRAME_SHEET_SAMPLES + 1) break
  }
  if (times[times.length - 1] !== end) {
    times.push(end)
  }
  return times
}

export function resolveFrameSheetTimestamps(
  args: VisualFrameSheetSamplingInput,
): VisualFrameSheetSamplingResult {
  if (args.at && args.range) {
    throw new VisualContextError("CONFLICTING_SAMPLES", "Use either --at or --range, not both.")
  }
  if (args.at) {
    return {
      timestampsMs: validateSampleCount(dedupeSorted(args.at)),
      rangeMs: null,
    }
  }

  const range = args.range ?? [0, 8000] as [number, number]
  const [start, end] = range
  if (args.everyMs && args.samples) {
    throw new VisualContextError("CONFLICTING_SAMPLES", "Use either --samples or --every, not both.")
  }
  if (args.everyFrames && (args.samples || args.everyMs)) {
    throw new VisualContextError("CONFLICTING_SAMPLES", "Use --every-frames without --samples or --every.")
  }

  let timestamps: number[]
  if (args.everyFrames) {
    if (!Number.isFinite(args.fps) || args.fps <= 0) {
      throw new VisualContextError("FPS_REQUIRED", "--every-frames requires a valid --fps value.")
    }
    const intervalMs = Math.round((args.everyFrames / args.fps) * 1000)
    if (intervalMs <= 0) {
      throw new VisualContextError("INVALID_INTERVAL", "--every-frames produced an empty interval.")
    }
    timestamps = timestampsForInterval(start, end, intervalMs)
  } else if (args.everyMs) {
    timestamps = timestampsForInterval(start, end, args.everyMs)
  } else {
    const samples = args.samples ?? DEFAULT_FRAME_SHEET_SAMPLES
    timestamps = timestampsForSampleCount(start, end, samples)
  }

  return {
    timestampsMs: validateSampleCount(dedupeSorted(timestamps)),
    rangeMs: range,
  }
}

export function getFrameSheetColumns(sampleCount: number, requested: number | null): number {
  if (requested !== null) {
    if (requested < 1 || requested > 4) {
      throw new VisualContextError("INVALID_COLUMNS", "--columns must be between 1 and 4.")
    }
    return Math.min(requested, sampleCount)
  }
  if (sampleCount <= 3) return sampleCount
  return 4
}

export function frameForTime(timeMs: number, fps: number): number {
  return Math.round((timeMs / 1000) * fps)
}

export function secondsLabel(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}s`
}

export function buildFrameSheetSummary(timestampsMs: number[]): string {
  const first = timestampsMs[0]
  const last = timestampsMs[timestampsMs.length - 1]
  if (timestampsMs.length === 1) {
    return `Frame sheet with 1 sample at ${secondsLabel(first)}.`
  }
  return `Frame sheet with ${timestampsMs.length} samples from ${secondsLabel(first)} to ${secondsLabel(last)}.`
}
