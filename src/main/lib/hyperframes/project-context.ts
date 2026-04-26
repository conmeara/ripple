import { eq } from "drizzle-orm"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { basename, extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import { projects, type Project } from "../db/schema"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import type { HyperframesProjectContext, HyperframesRenderFormat } from "./types"
import { HyperframesError } from "./types"

export function getHyperframesProjectPath(project: Project): string {
  return resolve(project.localPath || project.path)
}

export async function resolveHyperframesProjectContext(input: {
  projectId: string
  allowArchived?: boolean
}): Promise<HyperframesProjectContext> {
  const { getDatabase } = await import("../db")
  const project = getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get()

  if (!project) {
    throw new HyperframesError("Project not found.", "PROJECT_NOT_FOUND")
  }

  if (project.archivedAt && !input.allowArchived) {
    throw new HyperframesError(
      "Restore this project before previewing or exporting it.",
      "PROJECT_ARCHIVED",
    )
  }

  const projectPath = getHyperframesProjectPath(project)
  return {
    key: `project:${project.id}`,
    projectId: project.id,
    project,
    projectPath,
  }
}

export function assertHyperframesProjectFiles(projectPath: string): void {
  if (
    !existsSync(join(projectPath, "index.html")) ||
    !existsSync(join(projectPath, "hyperframes.json"))
  ) {
    throw new HyperframesError(
      "This folder no longer looks like a Ripple project.",
      "PROJECT_FILES_MISSING",
    )
  }
}

export function normalizeProjectRelativePath(filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new HyperframesError(
      "Absolute paths are not allowed.",
      "PROJECT_ABSOLUTE_PATH",
    )
  }

  const normalized = normalize(filePath)
  const segments = normalized.split(sep)
  if (segments.includes("..") || normalized === "" || normalized === ".") {
    throw new HyperframesError(
      "Path traversal is not allowed.",
      "PROJECT_PATH_TRAVERSAL",
    )
  }

  return normalized.replace(/\\/g, "/")
}

export function resolveProjectRelativePath(
  context: HyperframesProjectContext,
  filePath: string,
): string {
  const normalized = normalizeProjectRelativePath(filePath)
  const resolved = resolve(context.projectPath, normalized)

  if (!isPathInsideDirectory(context.projectPath, resolved)) {
    throw new HyperframesError(
      "Target path is outside the project.",
      "PROJECT_PATH_ESCAPE",
    )
  }

  return resolved
}

function safeFileStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return stem || "render"
}

export async function createRenderOutputPath(input: {
  context: HyperframesProjectContext
  jobId: string
  format: HyperframesRenderFormat
}): Promise<string> {
  const exportsPath = resolveProjectRelativePath(input.context, "exports")
  await mkdir(exportsPath, { recursive: true })
  const slug = safeFileStem(input.context.project.slug || input.context.project.name)
  const outputPath = join(exportsPath, `${slug}-${input.jobId}.${input.format}`)

  if (!isPathInsideDirectory(input.context.projectPath, outputPath)) {
    throw new HyperframesError(
      "Render output path is outside the project.",
      "PROJECT_PATH_ESCAPE",
    )
  }

  return outputPath
}

export function toProjectRelativePath(
  context: HyperframesProjectContext,
  absolutePath: string,
): string {
  const resolved = resolve(absolutePath)
  if (!isPathInsideDirectory(context.projectPath, resolved)) {
    throw new HyperframesError(
      "Artifact path is outside the project.",
      "PROJECT_PATH_ESCAPE",
    )
  }

  return normalize(resolved.slice(context.projectPath.length + 1)).replace(/\\/g, "/")
}

export function isSupportedSnapshotArtifact(fileName: string): boolean {
  return extname(fileName).toLowerCase() === ".png" && basename(fileName) === fileName
}
