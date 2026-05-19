import { copyFile, mkdir, readdir, readFile, realpath, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { createVisualContextService } from "../visual-context"
import {
  isSupportedSnapshotArtifact,
  resolveHyperframesProjectContext,
  resolveProjectRelativePath,
} from "./project-context"
import { runHyperframesCommand } from "./runtime"
import type {
  HyperframesCommandResult,
  HyperframesProjectContext,
  HyperframesSnapshotResult,
} from "./types"
import { HyperframesError } from "./types"

const DEFAULT_SNAPSHOT_FRAMES = 5
const FAST_SNAPSHOT_MAX_WIDTH = 1920

interface SnapshotFileInfo {
  mtimeMs: number
  size: number
}

export interface SnapshotMetadata {
  entry: string
  durationSeconds: number | null
}

async function listSnapshotFiles(snapshotDir: string): Promise<Map<string, SnapshotFileInfo>> {
  try {
    const entries = await readdir(snapshotDir)
    const files = new Map<string, SnapshotFileInfo>()

    for (const entry of entries.filter(isSupportedSnapshotArtifact)) {
      const fileStat = await stat(join(snapshotDir, entry))
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

export function getChangedSnapshotFiles(
  before: Map<string, SnapshotFileInfo>,
  after: Map<string, SnapshotFileInfo>,
): string[] {
  const changed = Array.from(after.entries())
    .filter(([fileName, info]) => {
      const previous = before.get(fileName)
      return !previous || previous.mtimeMs !== info.mtimeMs || previous.size !== info.size
    })
    .map(([fileName]) => fileName)
    .sort()

  return changed.length > 0 ? changed : Array.from(after.keys()).sort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function finitePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

function parseHtmlNumberAttribute(html: string, attribute: string): number | null {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`\\b${escaped}=["'](\\d+(?:\\.\\d+)?)["']`, "i").exec(html)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function readSnapshotMetadata(
  context: HyperframesProjectContext,
): Promise<SnapshotMetadata> {
  let entry = "index.html"
  let durationSeconds: number | null = null

  try {
    const metadataPath = resolveProjectRelativePath(context, "hyperframes.json")
    const parsed = JSON.parse(await readFile(metadataPath, "utf8"))
    if (isRecord(parsed)) {
      if (typeof parsed.entry === "string" && parsed.entry.trim()) {
        entry = parsed.entry.trim()
      }
      durationSeconds = finitePositiveNumber(parsed.duration)
    }
  } catch (error) {
    if (error instanceof HyperframesError) throw error
  }

  try {
    const html = await readFile(resolveProjectRelativePath(context, entry), "utf8")
    durationSeconds = parseHtmlNumberAttribute(html, "data-duration") ?? durationSeconds
  } catch (error) {
    if (error instanceof HyperframesError) throw error
  }

  return {
    entry,
    durationSeconds,
  }
}

export function resolveSnapshotTimestampsSeconds(input: {
  at?: number[]
  frames?: number
  durationSeconds?: number | null
}): number[] | null {
  const explicitTimes = input.at
    ?.filter((time) => Number.isFinite(time) && time >= 0)

  if (explicitTimes && explicitTimes.length > 0) return explicitTimes

  const durationSeconds = input.durationSeconds
  if (!Number.isFinite(durationSeconds) || !durationSeconds || durationSeconds <= 0) {
    return null
  }

  const frames = Math.max(1, Math.floor(input.frames ?? DEFAULT_SNAPSHOT_FRAMES))
  if (frames === 1) return [durationSeconds / 2]

  return Array.from({ length: frames }, (_value, index) =>
    (index / (frames - 1)) * durationSeconds,
  )
}

export function buildFastSnapshotFileName(input: {
  index: number
  timeSeconds: number
  durationSeconds?: number | null
  explicitAt: boolean
}): string {
  const label = input.explicitAt || !input.durationSeconds || input.durationSeconds <= 0
    ? `${input.timeSeconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}s`
    : `${Math.round((input.timeSeconds / input.durationSeconds) * 100)}pct`
  return `frame-${String(input.index).padStart(2, "0")}-at-${label}.png`
}

function fastSnapshotCommandResult(input: {
  paths: string[]
  elapsedMs: number
}): HyperframesCommandResult {
  return {
    ok: true,
    stdout: `Captured ${input.paths.length} snapshot(s) with Ripple visual context in ${input.elapsedMs}ms.\n`,
    stderr: "",
  }
}

async function captureHyperframesSnapshotWithService(input: {
  context: HyperframesProjectContext
  frames?: number
  at?: number[]
  timeout?: number
  repoRoot?: string
}): Promise<HyperframesSnapshotResult | null> {
  const metadata = await readSnapshotMetadata(input.context)
  const timestampsSeconds = resolveSnapshotTimestampsSeconds({
    at: input.at,
    frames: input.frames,
    durationSeconds: metadata.durationSeconds,
  })
  if (!timestampsSeconds) return null

  const startedAt = Date.now()
  const snapshotDir = resolveProjectRelativePath(input.context, "snapshots")
  await mkdir(snapshotDir, { recursive: true })

  const service = createVisualContextService({
    backendOrder: ["fast-browser", "hyperframes-cli"],
  })
  let captureCleanupPaths: string[] = []
  const protectedSnapshotPaths = new Set<string>()

  try {
    const capture = await service.captureFrames({
      projectPath: input.context.projectPath,
      timestampsMs: timestampsSeconds.map((time) => Math.round(time * 1000)),
      fps: 30,
      width: FAST_SNAPSHOT_MAX_WIDTH,
      height: 1080,
      format: "png",
      timeoutMs: input.timeout ?? 5000,
      reason: "snapshot",
      intent: "specific-frame",
      repoRoot: input.repoRoot,
    })
    captureCleanupPaths = capture.cleanupPaths

    if (capture.frames.length !== timestampsSeconds.length) {
      throw new HyperframesError(
        "Ripple visual context captured the wrong number of snapshot frames.",
        "SNAPSHOT_SAMPLE_MISMATCH",
        {
          captured: capture.frames.length,
          expected: timestampsSeconds.length,
        },
      )
    }

    const projectRealPath = await realpath(input.context.projectPath)
    const paths: string[] = []
    const explicitAt = Boolean(input.at?.length)
    for (const [index, frame] of capture.frames.entries()) {
      const sourcePath = frame.path
      const sourceRealPath = await realpath(sourcePath)
      if (!isPathInsideDirectory(projectRealPath, sourceRealPath)) {
        throw new HyperframesError(
          "Ripple visual context produced a frame outside the project.",
          "SNAPSHOT_PATH_ESCAPE",
        )
      }
      const filename = buildFastSnapshotFileName({
        index,
        timeSeconds: timestampsSeconds[index],
        durationSeconds: metadata.durationSeconds,
        explicitAt,
      })
      const destination = join(snapshotDir, filename)
      const destinationRealPath = await realpath(destination).catch(() => null)
      if (destinationRealPath !== sourceRealPath) {
        await copyFile(sourceRealPath, destination)
      }
      protectedSnapshotPaths.add(await realpath(destination))
      const fileStat = await stat(destination)
      if (!fileStat.isFile() || fileStat.size <= 0) {
        throw new HyperframesError(
          "Ripple visual context produced an empty frame.",
          "SNAPSHOT_EMPTY",
          { relativePath: `snapshots/${filename}` },
        )
      }
      paths.push(`snapshots/${filename}`)
    }

    return {
      projectId: input.context.projectId,
      projectPath: input.context.projectPath,
      paths,
      command: fastSnapshotCommandResult({
        paths,
        elapsedMs: Date.now() - startedAt,
      }),
    }
  } finally {
    await Promise.all(
      captureCleanupPaths.map(async (path) => {
        const cleanupRealPath = await realpath(path).catch(() => null)
        if (cleanupRealPath && protectedSnapshotPaths.has(cleanupRealPath)) return
        await rm(path, { recursive: true, force: true }).catch(() => undefined)
      }),
    )
    await service.shutdown()
  }
}

async function captureHyperframesSnapshotWithCli(input: {
  context: HyperframesProjectContext
  frames?: number
  at?: number[]
  timeout?: number
  repoRoot?: string
}): Promise<HyperframesSnapshotResult> {
  const snapshotDir = resolveProjectRelativePath(input.context, "snapshots")
  const before = await listSnapshotFiles(snapshotDir)
  const args = ["snapshot"]

  if (input.at && input.at.length > 0) {
    args.push("--at", input.at.join(","))
  } else {
    args.push("--frames", String(input.frames ?? DEFAULT_SNAPSHOT_FRAMES))
  }

  args.push("--timeout", String(input.timeout ?? 5000))
  args.push(input.context.projectPath)

  const command = await runHyperframesCommand(args, {
    repoRoot: input.repoRoot,
    cwd: input.context.projectPath,
    timeout: Math.max(10000, input.timeout ?? 30000),
  })

  if (!command.ok) {
    throw new HyperframesError(
      "Ripple could not capture snapshots for this project.",
      "SNAPSHOT_FAILED",
      command,
    )
  }

  const after = await listSnapshotFiles(snapshotDir)
  const snapshotFiles = getChangedSnapshotFiles(before, after)
  const paths = snapshotFiles.map((file) => `snapshots/${file}`)

  if (paths.length === 0) {
    throw new HyperframesError(
      "HyperFrames did not create snapshot artifacts.",
      "SNAPSHOT_ARTIFACTS_MISSING",
    )
  }

  for (const relativePath of paths) {
    const fileStat = await stat(join(input.context.projectPath, relativePath))
    if (fileStat.size <= 0) {
      throw new HyperframesError(
        "HyperFrames created an empty snapshot artifact.",
        "SNAPSHOT_EMPTY",
        { relativePath },
      )
    }
  }

  return {
    projectId: input.context.projectId,
    projectPath: input.context.projectPath,
    paths,
    command,
  }
}

export async function captureHyperframesSnapshot(input: {
  projectId: string
  frames?: number
  at?: number[]
  timeout?: number
  repoRoot?: string
}): Promise<HyperframesSnapshotResult> {
  const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
  try {
    const serviceResult = await captureHyperframesSnapshotWithService({
      context,
      frames: input.frames,
      at: input.at,
      timeout: input.timeout,
      repoRoot: input.repoRoot,
    })
    if (serviceResult) return serviceResult
  } catch (error) {
    console.warn("[Ripple] Visual Context Service snapshot failed; falling back to HyperFrames CLI:", error)
  }

  return captureHyperframesSnapshotWithCli({
    context,
    frames: input.frames,
    at: input.at,
    timeout: input.timeout,
    repoRoot: input.repoRoot,
  })
}
