import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  isSupportedSnapshotArtifact,
  resolveHyperframesProjectContext,
  resolveProjectRelativePath,
} from "./project-context"
import { runHyperframesCommand } from "./runtime"
import type { HyperframesSnapshotResult } from "./types"
import { HyperframesError } from "./types"

interface SnapshotFileInfo {
  mtimeMs: number
  size: number
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

export async function captureHyperframesSnapshot(input: {
  projectId: string
  frames?: number
  at?: number[]
  timeout?: number
  repoRoot?: string
}): Promise<HyperframesSnapshotResult> {
  const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
  const snapshotDir = resolveProjectRelativePath(context, "snapshots")
  const before = await listSnapshotFiles(snapshotDir)
  const args = ["snapshot"]

  if (input.at && input.at.length > 0) {
    args.push("--at", input.at.join(","))
  } else {
    args.push("--frames", String(input.frames ?? 5))
  }

  args.push("--timeout", String(input.timeout ?? 5000))
  args.push(context.projectPath)

  const command = await runHyperframesCommand(args, {
    repoRoot: input.repoRoot,
    cwd: context.projectPath,
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
    const fileStat = await stat(join(context.projectPath, relativePath))
    if (fileStat.size <= 0) {
      throw new HyperframesError(
        "HyperFrames created an empty snapshot artifact.",
        "SNAPSHOT_EMPTY",
        { relativePath },
      )
    }
  }

  return {
    projectId: context.projectId,
    projectPath: context.projectPath,
    paths,
    command,
  }
}
