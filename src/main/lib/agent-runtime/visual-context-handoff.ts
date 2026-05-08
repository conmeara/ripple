import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import {
  RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION,
  type RippleVisualContextHandoffManifest,
  type RippleVisualContextHandoffSheet,
  type RippleVisualContextHandoffSnapshot,
} from "../../../shared/visual-context-handoff"
import { runVisualCommand } from "../../../cli/visual"
import {
  createVisualContextService,
  type VisualCurrentFrameSnapshot,
} from "../visual-context"
import { isPathInsideDirectory } from "../ripple-projects/paths"

export interface AgentVisualContextHandoff {
  manifestPath: string
  promptContext: string
}

export function shouldPrepareAgentVisualContextHandoff(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RIPPLE_EAGER_AGENT_VISUAL_CONTEXT === "1"
}

function projectRelative(projectPath: string, path: string): string {
  return relative(projectPath, path).replace(/\\/g, "/")
}

async function readProjectDurationMs(projectPath: string): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(join(projectPath, "hyperframes.json"), "utf8"))
    const durationSeconds = Number(parsed?.duration)
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      return Math.round(durationSeconds * 1000)
    }
  } catch {
    // Fall through to a short, useful default for ad-hoc projects.
  }
  return 8000
}

async function assertInsideProject(projectPath: string, path: string): Promise<void> {
  const [projectRealPath, targetRealPath] = await Promise.all([
    realpath(projectPath),
    realpath(path),
  ])
  if (!isPathInsideDirectory(projectRealPath, targetRealPath)) {
    throw new Error("Visual context handoff artifact escaped the project.")
  }
}

async function captureHandoffSnapshot(input: {
  currentFrameSnapshot: VisualCurrentFrameSnapshot
  handoffDir: string
  repoRoot?: string
}): Promise<RippleVisualContextHandoffSnapshot | null> {
  const service = createVisualContextService()
  try {
    const outputDir = join(input.handoffDir, "snapshot")
    await mkdir(outputDir, { recursive: true })
    const fps = input.currentFrameSnapshot.fps ?? 30
    const result = await service.captureSnapshot({
      projectPath: input.currentFrameSnapshot.projectPath,
      sourcePath: input.currentFrameSnapshot.sourcePath,
      compositionPath: input.currentFrameSnapshot.compositionPath,
      sourceRevisionId: input.currentFrameSnapshot.sourceRevisionId,
      timeMs: input.currentFrameSnapshot.timeMs,
      fps,
      width: input.currentFrameSnapshot.width ?? 1920,
      height: input.currentFrameSnapshot.height ?? 1080,
      format: "png",
      timeoutMs: 5000,
      reason: "agent-context",
      outputDir,
      repoRoot: input.repoRoot,
      env: process.env,
      preferredBackend: "fast-browser",
    })
    const frame = result.frames[0]
    if (!frame) return null
    await assertInsideProject(input.currentFrameSnapshot.projectPath, frame.path)
    return {
      path: projectRelative(input.currentFrameSnapshot.projectPath, frame.path),
      timeMs: frame.timeMs,
      frame: frame.frame,
      width: frame.width,
      height: frame.height,
      backend: result.backend,
      elapsedMs: Math.round(result.elapsedMs),
    }
  } finally {
    await service.shutdown()
  }
}

async function captureHandoffSheet(input: {
  currentFrameSnapshot: VisualCurrentFrameSnapshot
  durationMs: number
  repoRoot?: string
}): Promise<RippleVisualContextHandoffSheet | null> {
  const sourcePath = input.currentFrameSnapshot.sourcePath ?? input.currentFrameSnapshot.projectPath
  const result = await runVisualCommand([
    "sheet",
    "--dir",
    sourcePath,
    "--range",
    `0ms..${input.durationMs}ms`,
    "--samples",
    "8",
    "--columns",
    "4",
    "--backend",
    "fast-browser",
    "--json",
  ], {
    cwd: sourcePath,
    env: process.env,
    repoRoot: input.repoRoot,
  })
  if (result.exitCode !== 0) return null
  const payload = JSON.parse(result.stdout) as {
    backend?: string
    elapsedMs?: number
    sheet?: {
      id?: string
      path?: string
      manifestPath?: string
      sampleCount?: number
      summary?: string
    }
  }
  if (!payload.sheet?.path || !payload.sheet.manifestPath) return null
  await Promise.all([
    assertInsideProject(input.currentFrameSnapshot.projectPath, resolve(sourcePath, payload.sheet.path)),
    assertInsideProject(input.currentFrameSnapshot.projectPath, resolve(sourcePath, payload.sheet.manifestPath)),
  ])
  return {
    id: payload.sheet.id ?? "handoff-sheet",
    path: payload.sheet.path,
    manifestPath: payload.sheet.manifestPath,
    sampleCount: payload.sheet.sampleCount ?? 0,
    summary: payload.sheet.summary ?? "Frame sheet captured by Ripple.",
    backend: payload.backend ?? "fast-browser",
    elapsedMs: Math.round(payload.elapsedMs ?? 0),
  }
}

export async function prepareAgentVisualContextHandoff(input: {
  runId: string
  currentFrameSnapshot: VisualCurrentFrameSnapshot | null | undefined
  repoRoot?: string
}): Promise<AgentVisualContextHandoff | null> {
  const currentFrameSnapshot = input.currentFrameSnapshot
  if (!currentFrameSnapshot) return null

  const projectPath = resolve(currentFrameSnapshot.projectPath)
  const handoffDir = join(projectPath, ".ripple", "agent-visual-context", input.runId)
  await mkdir(handoffDir, { recursive: true })
  await assertInsideProject(projectPath, handoffDir)

  const durationMs = await readProjectDurationMs(projectPath)
  const [snapshot, sheet] = await Promise.all([
    captureHandoffSnapshot({
      currentFrameSnapshot: {
        ...currentFrameSnapshot,
        projectPath,
      },
      handoffDir,
      repoRoot: input.repoRoot,
    }).catch((error) => {
      console.warn("[Ripple] Could not prepare agent visual snapshot handoff:", error)
      return null
    }),
    captureHandoffSheet({
      currentFrameSnapshot: {
        ...currentFrameSnapshot,
        projectPath,
      },
      durationMs,
      repoRoot: input.repoRoot,
    }).catch((error) => {
      console.warn("[Ripple] Could not prepare agent visual sheet handoff:", error)
      return null
    }),
  ])

  if (!snapshot && !sheet) return null

  const manifest: RippleVisualContextHandoffManifest = {
    version: RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION,
    createdAt: Date.now(),
    projectPath,
    sourcePath: currentFrameSnapshot.sourcePath ? resolve(currentFrameSnapshot.sourcePath) : null,
    compositionPath: currentFrameSnapshot.compositionPath ?? null,
    snapshot,
    sheet,
  }
  const manifestPath = join(handoffDir, "manifest.json")
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await stat(manifestPath)
  const promptLines = [
    "Ripple prepared visual context:",
    snapshot
      ? `- Current-frame snapshot captured at run start: ${snapshot.path} (frame ${snapshot.frame}, ${(snapshot.timeMs / 1000).toFixed(3)}s).`
      : null,
    sheet
      ? `- Timeline frame sheet captured at run start: ${sheet.path} (${sheet.summary})`
      : null,
    sheet
      ? `- Frame sheet manifest: ${sheet.manifestPath}`
      : null,
    "- Treat these prepared artifacts as pre-edit context only. Fresh visual checks never reuse these files; after changing source, verify with `ripple snapshot --at current --json` for the visible app frame or `ripple frame-sheet --range ... --json` for motion over time.",
  ].filter((line): line is string => Boolean(line))

  return {
    manifestPath,
    promptContext: promptLines.join("\n"),
  }
}
