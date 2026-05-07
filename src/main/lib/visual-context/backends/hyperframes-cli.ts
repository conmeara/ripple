import { copyFile, mkdir, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  buildHyperframesEnvironment,
  runHyperframesCommand,
} from "../../hyperframes/runtime"
import type {
  VisualCapturedFrame,
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
} from "./types"

interface SnapshotFileInfo {
  mtimeMs: number
  size: number
}

async function listSnapshotFiles(snapshotDir: string): Promise<Map<string, SnapshotFileInfo>> {
  try {
    const entries = await readdir(snapshotDir)
    const files = new Map<string, SnapshotFileInfo>()
    for (const entry of entries.filter((item) => /\.(png|jpg|jpeg|webp)$/i.test(item))) {
      const fileStat = await stat(join(snapshotDir, entry))
      if (!fileStat.isFile()) continue
      files.set(entry, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
      })
    }
    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map()
    throw error
  }
}

function changedSnapshotFiles(
  before: Map<string, SnapshotFileInfo>,
  after: Map<string, SnapshotFileInfo>,
): string[] {
  return Array.from(after.entries())
    .filter(([fileName, info]) => {
      const previous = before.get(fileName)
      return !previous || previous.mtimeMs !== info.mtimeMs || previous.size !== info.size
    })
    .map(([fileName]) => fileName)
    .sort()
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

export class HyperframesCliVisualBackend implements VisualCaptureBackend {
  readonly id = "hyperframes-cli"
  readonly supportsWarmSession = false

  async captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    const startedAt = performance.now()
    const sourcePath = input.sourcePath ?? input.projectPath
    const snapshotDir = join(sourcePath, "snapshots")
    const before = await listSnapshotFiles(snapshotDir)
    const atSeconds = input.timestampsMs
      .map((timeMs) => (timeMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""))
      .join(",")
    const commandStartedAt = performance.now()
    const command = await runHyperframesCommand([
      "snapshot",
      "--at",
      atSeconds,
      "--timeout",
      String(input.timeoutMs),
      sourcePath,
    ], {
      cwd: sourcePath,
      env: buildHyperframesEnvironment(input.env ?? process.env, { repoRoot: input.repoRoot }),
      repoRoot: input.repoRoot,
      timeout: Math.max(10_000, input.timeoutMs + 5_000),
    })
    if (!command.ok) {
      throw new Error("HyperFrames CLI could not capture the requested frames.")
    }

    const after = await listSnapshotFiles(snapshotDir)
    const changed = changedSnapshotFiles(before, after)
    if (changed.length !== input.timestampsMs.length) {
      throw new Error(`HyperFrames CLI captured ${changed.length} frame(s), expected ${input.timestampsMs.length}.`)
    }

    const sourceFramePaths = changed.map((fileName) => join(snapshotDir, fileName))
    const framePaths = input.outputDir
      ? await copyFramesToOutputDir({
        framePaths: sourceFramePaths,
        outputDir: input.outputDir,
      })
      : sourceFramePaths

    const cleanupPaths = changed
      .filter((fileName) => !before.has(fileName))
      .map((fileName) => join(snapshotDir, fileName))

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
      timings: {
        commandMs: performance.now() - commandStartedAt,
      },
      warnings: [],
      cleanupPaths,
    }
  }
}

export const hyperframesCliVisualBackend = new HyperframesCliVisualBackend()
