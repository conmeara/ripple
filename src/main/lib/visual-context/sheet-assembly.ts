import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"
import { getAppManagedCommandCandidates } from "../hyperframes/runtime"
import { VisualContextError } from "./errors"

const execFileAsync = promisify(execFile)

export type VisualFrameSheetExecFile = (
  file: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    timeout: number
  },
) => Promise<unknown>

export interface VisualFrameSheetAssemblyInput {
  framesDir: string
  outputPath: string
  columns: number
  rows: number
  maxSheetWidth: number
  env: NodeJS.ProcessEnv
  commandCandidates?: string[]
  execFile?: VisualFrameSheetExecFile
}

export function buildFrameSheetFfmpegArgs(input: {
  framesDir: string
  outputPath: string
  columns: number
  rows: number
  maxSheetWidth: number
}): string[] {
  const cellWidth = Math.max(120, Math.floor(input.maxSheetWidth / input.columns))
  const filter = [
    `scale=${cellWidth}:-2:force_original_aspect_ratio=decrease`,
    `tile=${input.columns}x${input.rows}`,
  ].join(",")
  return [
    "-y",
    "-framerate",
    "1",
    "-i",
    join(input.framesDir, "%03d.png"),
    "-frames:v",
    "1",
    "-vf",
    filter,
    input.outputPath,
  ]
}

export async function assembleFrameSheetWithFfmpeg(
  input: VisualFrameSheetAssemblyInput,
): Promise<void> {
  const commandCandidates = input.commandCandidates ?? [
    ...getAppManagedCommandCandidates("ffmpeg"),
    "ffmpeg",
  ]
  const args = buildFrameSheetFfmpegArgs(input)
  const runExecFile = input.execFile ?? execFileAsync

  let lastError: unknown
  for (const candidate of commandCandidates) {
    try {
      await runExecFile(candidate, args, {
        env: input.env,
        timeout: 30_000,
      })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw new VisualContextError(
    "FFMPEG_TILE_FAILED",
    lastError instanceof Error
      ? `FFmpeg could not assemble the frame sheet: ${lastError.message}`
      : "FFmpeg could not assemble the frame sheet.",
  )
}
