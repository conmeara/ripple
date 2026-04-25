import { existsSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

export class RippleProjectPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleProjectPathError"
  }
}

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function createProjectSlug(name: string): string {
  const normalized = normalizeProjectName(name)
  const slug = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (!slug) {
    throw new RippleProjectPathError("Enter a project name with letters or numbers.")
  }

  return slug
}

export function getDefaultRippleRoot(homePath: string): string {
  return join(homePath, "Ripple")
}

export function isPathInsideDirectory(rootPath: string, candidatePath: string): boolean {
  const resolvedRoot = resolve(rootPath)
  const resolvedCandidate = resolve(candidatePath)
  const result = relative(resolvedRoot, resolvedCandidate)

  return result === "" || (!result.startsWith("..") && result !== ".." && !result.startsWith(`..${sep}`))
}

export function isPathInsideRippleRoot(rippleRoot: string, candidatePath: string): boolean {
  return isPathInsideDirectory(rippleRoot, candidatePath)
}

export function getUniqueProjectPath(
  rippleRoot: string,
  slug: string,
  pathExists: (path: string) => boolean = existsSync,
): { slug: string; projectPath: string } {
  let candidateSlug = slug
  let projectPath = join(rippleRoot, candidateSlug)
  let suffix = 2

  while (pathExists(projectPath)) {
    candidateSlug = `${slug}-${suffix}`
    projectPath = join(rippleRoot, candidateSlug)
    suffix += 1
  }

  if (!isPathInsideRippleRoot(rippleRoot, projectPath)) {
    throw new RippleProjectPathError("Resolved project path is outside the Ripple folder.")
  }

  return { slug: candidateSlug, projectPath }
}

export function toProjectDisplayName(name: string): string {
  const normalized = normalizeProjectName(name)
  if (!normalized) {
    throw new RippleProjectPathError("Enter a project name.")
  }
  createProjectSlug(normalized)
  return normalized
}
