import { lstat, mkdir, realpath } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  getRippleExportExtension,
  isRippleExportDirectoryFormat,
  type RippleExportFormat,
} from "../../../shared/ripple-exports"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "../hyperframes/project-context"
import type { HyperframesProjectContext } from "../hyperframes/types"
import { HyperframesError } from "../hyperframes/types"
import { isPathInsideDirectory } from "../ripple-projects/paths"

export function safeExportStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return stem || "export"
}

export async function createExportOutputPath(input: {
  projectContext: HyperframesProjectContext
  jobId: string
  compositionName: string
  format: RippleExportFormat
}): Promise<string> {
  const exportsPath = resolveProjectRelativePath(input.projectContext, "exports")
  await mkdir(exportsPath, { recursive: true })
  const exportsStats = await lstat(exportsPath)
  if (!exportsStats.isDirectory() || exportsStats.isSymbolicLink()) {
    throw new HyperframesError(
      "Export output folder is not a regular project folder.",
      "EXPORT_PATH_ESCAPE",
    )
  }

  const [projectRealPath, exportsRealPath] = await Promise.all([
    realpath(input.projectContext.projectPath),
    realpath(exportsPath),
  ])
  if (!isPathInsideDirectory(projectRealPath, exportsRealPath)) {
    throw new HyperframesError(
      "Export output folder resolves outside the project.",
      "EXPORT_PATH_ESCAPE",
    )
  }

  const projectStem = safeExportStem(
    input.projectContext.project.slug || input.projectContext.project.name,
  )
  const compositionStem = safeExportStem(input.compositionName)
  const outputName = isRippleExportDirectoryFormat(input.format)
    ? `${projectStem}-${compositionStem}-${input.jobId}-png-sequence`
    : `${projectStem}-${compositionStem}-${input.jobId}.${getRippleExportExtension(input.format)}`
  const outputPath = join(exportsRealPath, outputName)

  if (!isPathInsideDirectory(exportsRealPath, outputPath)) {
    throw new HyperframesError(
      "Export output path is outside the project.",
      "EXPORT_PATH_ESCAPE",
    )
  }

  return outputPath
}

export function assertProjectLocalEntryFile(input: {
  context: HyperframesProjectContext
  filePath: string
}): string {
  const normalized = normalizeProjectRelativePath(input.filePath)
  const resolved = resolve(input.context.projectPath, normalized)
  if (!isPathInsideDirectory(input.context.projectPath, resolved)) {
    throw new HyperframesError(
      "Composition path is outside the project.",
      "EXPORT_COMPOSITION_PATH_ESCAPE",
    )
  }
  return normalized
}

export async function prepareDestinationDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

export function assertDestinationMatchesFormat(input: {
  path: string
  format: RippleExportFormat
}): void {
  if (isRippleExportDirectoryFormat(input.format)) {
    if (!resolve(input.path)) {
      throw new HyperframesError(
        "Choose a folder for this export.",
        "EXPORT_DESTINATION_FORMAT_MISMATCH",
      )
    }
    return
  }

  const expected = `.${getRippleExportExtension(input.format)}`
  if (!resolve(input.path).toLowerCase().endsWith(expected)) {
    throw new HyperframesError(
      `Choose a ${expected} file for this export.`,
      "EXPORT_DESTINATION_FORMAT_MISMATCH",
    )
  }
}
