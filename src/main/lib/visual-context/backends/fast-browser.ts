import { copyFile, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  captureFramesWithFastBrowser,
} from "../fast-browser-capture"
import { VisualContextError } from "../errors"
import {
  buildHyperframesEnvironment,
} from "../../hyperframes/runtime"
import type {
  VisualCapturedFrame,
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
} from "./types"

async function frameInfo(input: {
  path: string
  index: number
  timeMs: number
  fps: number
  width: number
  height: number
}): Promise<VisualCapturedFrame> {
  const info = await stat(input.path)
  return {
    index: input.index,
    timeMs: input.timeMs,
    frame: Math.round((input.timeMs / 1000) * input.fps),
    path: input.path,
    width: input.width,
    height: input.height,
    sizeBytes: info.size,
  }
}

async function copyFramesToOutputDir(input: {
  framePaths: string[]
  outputDir: string
}): Promise<string[]> {
  await mkdir(input.outputDir, { recursive: true })
  const copied: string[] = []
  for (const [index, sourcePath] of input.framePaths.entries()) {
    const destination = join(input.outputDir, `${String(index).padStart(3, "0")}.png`)
    await copyFile(sourcePath, destination)
    copied.push(destination)
  }
  return copied
}

export class FastBrowserVisualBackend implements VisualCaptureBackend {
  readonly id = "fast-browser"
  readonly supportsWarmSession = false

  async captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    if (input.format !== "png") {
      throw new VisualContextError(
        "FAST_CAPTURE_FORMAT_UNSUPPORTED",
        "Fast browser capture currently returns PNG frames.",
      )
    }

    const startedAt = performance.now()
    const captureStartedAt = performance.now()
    const capture = await captureFramesWithFastBrowser({
      projectDir: input.sourcePath ?? input.projectPath,
      timestampsMs: input.timestampsMs,
      timeoutMs: input.timeoutMs,
      columns: 1,
      maxSheetWidth: input.width,
      settleMs: 0,
      env: buildHyperframesEnvironment(input.env ?? process.env, { repoRoot: input.repoRoot }),
      repoRoot: input.repoRoot,
    })
    const timings: Record<string, number> = {
      captureMs: performance.now() - captureStartedAt,
    }

    const framePaths = input.outputDir
      ? await copyFramesToOutputDir({
        framePaths: capture.framePaths,
        outputDir: input.outputDir,
      })
      : capture.framePaths

    return {
      backend: this.id,
      frames: await Promise.all(framePaths.map((path, index) =>
        frameInfo({
          path,
          index,
          timeMs: input.timestampsMs[index],
          fps: input.fps,
          width: input.width,
          height: input.height,
        })
      )),
      elapsedMs: performance.now() - startedAt,
      timings,
      warnings: [],
      cleanupPaths: capture.cleanupPaths ?? [],
    }
  }
}

export const fastBrowserVisualBackend = new FastBrowserVisualBackend()
