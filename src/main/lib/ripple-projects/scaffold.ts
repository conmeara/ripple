import { readdir, stat } from "node:fs/promises"
import { installRippleProjectTemplate } from "../hyperframes/templates/installer"
import type { ScaffoldMetadata, ScaffoldResult } from "./types"

const TOP_LEVEL_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".ripple",
  "index.html",
  "compositions",
  "assets",
  "exports",
  "hyperframes.json",
  "meta.json",
])

export class RippleScaffoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleScaffoldError"
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function assertSafeDestination(projectPath: string): Promise<void> {
  if (!(await pathExists(projectPath))) return

  const entries = await readdir(projectPath)
  const unrelated = entries.filter((entry) => !TOP_LEVEL_ENTRIES.has(entry))

  if (unrelated.length > 0) {
    throw new RippleScaffoldError(
      `Project folder already contains unrelated files: ${unrelated.join(", ")}`,
    )
  }
}

export async function writeRippleProjectScaffold(
  projectPath: string,
  metadata: ScaffoldMetadata,
): Promise<ScaffoldResult> {
  await assertSafeDestination(projectPath)

  return installRippleProjectTemplate({
    projectPath,
    metadata,
  })
}
