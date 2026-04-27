import { existsSync } from "node:fs"
import { copyFile, lstat, mkdir, readdir, realpath } from "node:fs/promises"
import { basename, extname, isAbsolute, relative, sep } from "node:path"
import type { Composition } from "../db/schema"
import {
  createRippleProjectAssetItem,
  getRippleProjectAssetKind,
  isGeneratedRippleProjectAssetPath,
  isImportableRippleProjectMediaPath,
  isVisibleRippleProjectAssetPath,
  sortRippleProjectAssets,
  sortRippleProjectCompositions,
  toRippleProjectCompositionItem,
  type RippleProjectAssetItem,
  type RippleProjectBrowserModel,
} from "../../../shared/hyperframes-project-model"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "./project-context"
import { buildHyperframesPlayerSourceUrl, getHyperframesPlayerMimeType } from "./player-source"
import type { HyperframesProjectContext } from "./types"

const maxImportedAssetBytes = 500 * 1024 * 1024

const importDirectoryByKind = {
  image: "assets/images",
  video: "assets/video",
  audio: "assets/audio",
} as const

export interface HyperframesProjectAssetImportResult {
  imported: Array<{
    sourcePath: string
    relativePath: string
  }>
  rejected: Array<{
    sourcePath: string
    reason: string
  }>
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function isRealPathInsideDirectory(rootPath: string, candidatePath: string): boolean {
  const result = relative(rootPath, candidatePath)
  return result === "" || (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result))
}

function sanitizeImportedAssetFileName(sourcePath: string): string {
  const sourceName = basename(sourcePath)
  const extension = extname(sourceName).toLowerCase()
  const baseName = basename(sourceName, extname(sourceName))
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "")

  return `${baseName || "asset"}${extension}`
}

async function ensureSafeAssetImportDirectory(input: {
  context: HyperframesProjectContext
  directory: string
}): Promise<void> {
  const projectRealPath = await realpath(input.context.projectPath)
  const directoryPath = normalizeProjectRelativePath(input.directory)
  let currentRelativePath = ""

  for (const segment of directoryPath.split("/")) {
    currentRelativePath = currentRelativePath
      ? `${currentRelativePath}/${segment}`
      : segment
    const absolutePath = resolveProjectRelativePath(input.context, currentRelativePath)

    let stats
    try {
      stats = await lstat(absolutePath)
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) throw error

      try {
        await mkdir(absolutePath)
      } catch (mkdirError) {
        if (!isNodeErrorCode(mkdirError, "EEXIST")) throw mkdirError
      }
      stats = await lstat(absolutePath)
    }

    if (stats.isSymbolicLink()) {
      throw new Error("Asset import destination contains a linked folder.")
    }
    if (!stats.isDirectory()) {
      throw new Error("Asset import destination is not a folder.")
    }

    const realDirectoryPath = await realpath(absolutePath)
    if (!isRealPathInsideDirectory(projectRealPath, realDirectoryPath)) {
      throw new Error("Asset import destination escapes the project.")
    }
  }
}

async function nextAvailableAssetPath(input: {
  context: HyperframesProjectContext
  directory: string
  fileName: string
}): Promise<string> {
  const extension = extname(input.fileName)
  const baseName = basename(input.fileName, extension)
  let candidate = normalizeProjectRelativePath(`${input.directory}/${input.fileName}`)
  let index = 2

  while (await pathExists(resolveProjectRelativePath(input.context, candidate))) {
    candidate = normalizeProjectRelativePath(
      `${input.directory}/${baseName}-${index}${extension}`,
    )
    index += 1
  }

  return candidate
}

async function scanAssetDirectory(input: {
  context: HyperframesProjectContext
  relativeDirectory: string
  assets: RippleProjectAssetItem[]
}): Promise<void> {
  const directoryPath = resolveProjectRelativePath(input.context, input.relativeDirectory)
  const entries = await readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = normalizeProjectRelativePath(
      `${input.relativeDirectory}/${entry.name}`,
    )

    if (isGeneratedRippleProjectAssetPath(relativePath)) continue

    const absolutePath = resolveProjectRelativePath(input.context, relativePath)
    const stats = await lstat(absolutePath)

    if (stats.isSymbolicLink()) continue

    if (stats.isDirectory()) {
      await scanAssetDirectory({
        context: input.context,
        relativeDirectory: relativePath,
        assets: input.assets,
      })
      continue
    }

    if (!stats.isFile() || !isVisibleRippleProjectAssetPath(relativePath)) {
      continue
    }

    input.assets.push(
      createRippleProjectAssetItem({
        projectId: input.context.projectId,
        relativePath,
        mimeType: getHyperframesPlayerMimeType(relativePath),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime,
        previewUrl: buildHyperframesPlayerSourceUrl({
          projectId: input.context.projectId,
          filePath: relativePath,
        }),
      }),
    )
  }
}

export async function scanHyperframesProjectAssets(
  context: HyperframesProjectContext,
): Promise<RippleProjectAssetItem[]> {
  const assetsPath = resolveProjectRelativePath(context, "assets")
  if (!existsSync(assetsPath)) return []

  const stats = await lstat(assetsPath)
  if (!stats.isDirectory() || stats.isSymbolicLink()) return []

  const assets: RippleProjectAssetItem[] = []
  await scanAssetDirectory({
    context,
    relativeDirectory: "assets",
    assets,
  })

  return sortRippleProjectAssets(assets)
}

export async function importHyperframesProjectAssets(input: {
  context: HyperframesProjectContext
  sourcePaths: string[]
}): Promise<HyperframesProjectAssetImportResult> {
  const imported: HyperframesProjectAssetImportResult["imported"] = []
  const rejected: HyperframesProjectAssetImportResult["rejected"] = []
  const seenSourcePaths = new Set<string>()

  for (const rawSourcePath of input.sourcePaths) {
    const sourcePath = rawSourcePath.trim()
    if (!sourcePath || seenSourcePaths.has(sourcePath)) continue
    seenSourcePaths.add(sourcePath)

    if (!isAbsolute(sourcePath)) {
      rejected.push({ sourcePath: rawSourcePath, reason: "No readable file path was provided." })
      continue
    }

    const fileName = sanitizeImportedAssetFileName(sourcePath)
    if (!isImportableRippleProjectMediaPath(fileName)) {
      rejected.push({ sourcePath, reason: "Only image, video, and audio files can be imported." })
      continue
    }

    const kind = getRippleProjectAssetKind(fileName)
    const targetDirectory = importDirectoryByKind[kind as keyof typeof importDirectoryByKind]
    if (!targetDirectory) {
      rejected.push({ sourcePath, reason: "This asset type is not importable yet." })
      continue
    }

    try {
      const sourceStats = await lstat(sourcePath)
      if (sourceStats.isSymbolicLink()) {
        rejected.push({ sourcePath, reason: "Linked files are not imported." })
        continue
      }
      if (!sourceStats.isFile()) {
        rejected.push({ sourcePath, reason: "Only files can be imported." })
        continue
      }
      if (sourceStats.size > maxImportedAssetBytes) {
        rejected.push({ sourcePath, reason: "File is larger than 500 MB." })
        continue
      }

      await ensureSafeAssetImportDirectory({
        context: input.context,
        directory: targetDirectory,
      })
      const relativePath = await nextAvailableAssetPath({
        context: input.context,
        directory: targetDirectory,
        fileName,
      })
      const destinationPath = resolveProjectRelativePath(input.context, relativePath)
      await ensureSafeAssetImportDirectory({
        context: input.context,
        directory: targetDirectory,
      })
      await copyFile(sourcePath, destinationPath)
      imported.push({ sourcePath, relativePath })
    } catch (error) {
      rejected.push({
        sourcePath,
        reason: error instanceof Error ? error.message : "Import failed.",
      })
    }
  }

  if (imported.length === 0 && rejected.length === 0 && input.sourcePaths.length > 0) {
    rejected.push({
      sourcePath: input.sourcePaths[0] ?? "",
      reason: "No importable media files were provided.",
    })
  }

  return { imported, rejected }
}

export async function buildHyperframesProjectBrowserModel(input: {
  context: HyperframesProjectContext
  compositions: Composition[]
}): Promise<RippleProjectBrowserModel> {
  const activeCompositionId = input.context.project.activeCompositionId ?? null
  const compositionItems = input.compositions.map((composition) =>
    toRippleProjectCompositionItem(composition, activeCompositionId),
  )

  return {
    project: {
      id: input.context.project.id,
      name: input.context.project.name,
      activeCompositionId,
      setupStatus: input.context.project.setupStatus,
      setupError: input.context.project.setupError,
    },
    compositions: sortRippleProjectCompositions(compositionItems),
    assets: await scanHyperframesProjectAssets(input.context),
    generatedAt: new Date(),
  }
}
