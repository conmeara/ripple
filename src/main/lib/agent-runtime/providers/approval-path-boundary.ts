import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { isPathInsideDirectory } from "../../ripple-projects/paths"

function comparablePath(path: string): string {
  return process.platform === "darwin" ? path.toLowerCase() : path
}

function realpathForBoundary(path: string): string {
  const resolved = resolve(path)
  if (existsSync(resolved)) {
    return realpathSync.native(resolved)
  }

  const missingSegments: string[] = []
  let current = resolved
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) return resolved
    missingSegments.unshift(basename(current))
    current = parent
  }

  return resolve(realpathSync.native(current), ...missingSegments)
}

export function isProjectLocalPath(input: {
  workspaceRoot: string
  candidatePath: string
}): boolean {
  const workspaceRoot = comparablePath(realpathForBoundary(input.workspaceRoot))
  const candidatePath = comparablePath(realpathForBoundary(input.candidatePath))
  return isPathInsideDirectory(workspaceRoot, candidatePath)
}
