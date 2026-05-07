import { readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, normalize, resolve } from "node:path"
import { isPathInsideDirectory } from "../../../shared/path-boundary"

export type VisualCompositionTargetErrorCode =
  | "COMPOSITION_PATH_ESCAPE"
  | "COMPOSITION_MISSING"
  | "COMPOSITION_SYMLINK_ESCAPE"
  | "RENDERER_IDENTITY_MISMATCH"
  | "SOURCE_WORKSPACE_MISSING"

export class VisualCompositionTargetError extends Error {
  constructor(
    public readonly code: VisualCompositionTargetErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = "VisualCompositionTargetError"
  }
}

export interface VisualRendererCompositionIdentity {
  projectPath?: string | null
  sourcePath?: string | null
  compositionPath?: string | null
  dirtyGeneration?: string | null
}

export interface VisualCompositionTargetInput {
  projectPath: string
  sourcePath?: string | null
  compositionPath?: string | null
  sourceRevisionId?: string | null
  allowMissingSourceFallback?: boolean
  rendererIdentity?: VisualRendererCompositionIdentity | null
}

export interface VisualCompositionTarget {
  projectPath: string
  projectRealPath: string
  sourcePath: string
  sourceRealPath: string
  sourceRevisionId: string | null
  entryPath: string
  compositionPath: string
  compositionFilePath: string
  compositionRealPath: string
  isEntryComposition: boolean
  fallbackReason: "source-workspace-missing" | null
  rendererDirtyGeneration: string | null
}

function normalizeProjectRelativePath(filePath: string, label: string): string {
  const normalized = normalize(filePath).replace(/\\/g, "/").replace(/^\/+/, "")
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    isAbsolute(normalized) ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new VisualCompositionTargetError(
      "COMPOSITION_PATH_ESCAPE",
      `${label} must stay inside the project.`,
      { filePath },
    )
  }
  return normalized
}

export function normalizeVisualCompositionPath(filePath: string): string {
  return normalizeProjectRelativePath(filePath, "Composition path")
}

async function readProjectEntryPath(projectPath: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(join(projectPath, "hyperframes.json"), "utf8"))
    if (typeof parsed?.entry === "string" && parsed.entry.trim()) {
      return normalizeProjectRelativePath(parsed.entry, "HyperFrames entry")
    }
  } catch {
    // HyperFrames defaults to index.html when no manifest entry is present.
  }
  return "index.html"
}

async function realpathOrFallbackSource(input: {
  projectRealPath: string
  projectPath: string
  sourcePath: string
  allowMissingSourceFallback: boolean
}): Promise<{ sourcePath: string; sourceRealPath: string; fallbackReason: VisualCompositionTarget["fallbackReason"] }> {
  try {
    const sourceRealPath = await realpath(input.sourcePath)
    return {
      sourcePath: input.sourcePath,
      sourceRealPath,
      fallbackReason: null,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && input.allowMissingSourceFallback) {
      return {
        sourcePath: input.projectPath,
        sourceRealPath: input.projectRealPath,
        fallbackReason: "source-workspace-missing",
      }
    }
    throw new VisualCompositionTargetError(
      "SOURCE_WORKSPACE_MISSING",
      "Visual source workspace is unavailable.",
      { sourcePath: input.sourcePath },
    )
  }
}

async function assertRendererIdentity(input: {
  projectRealPath: string
  sourceRealPath: string
  compositionPath: string
  rendererIdentity: VisualRendererCompositionIdentity | null | undefined
}): Promise<string | null> {
  const identity = input.rendererIdentity
  if (!identity) return null

  if (identity.projectPath) {
    const rendererProjectRealPath = await realpath(identity.projectPath)
    if (rendererProjectRealPath !== input.projectRealPath) {
      throw new VisualCompositionTargetError(
        "RENDERER_IDENTITY_MISMATCH",
        "Renderer project does not match the requested visual target.",
      )
    }
  }

  if (identity.sourcePath) {
    const rendererSourceRealPath = await realpath(identity.sourcePath)
    if (rendererSourceRealPath !== input.sourceRealPath) {
      throw new VisualCompositionTargetError(
        "RENDERER_IDENTITY_MISMATCH",
        "Renderer source workspace does not match the requested visual target.",
      )
    }
  }

  if (identity.compositionPath) {
    const rendererCompositionPath = normalizeVisualCompositionPath(identity.compositionPath)
    if (rendererCompositionPath !== input.compositionPath) {
      throw new VisualCompositionTargetError(
        "RENDERER_IDENTITY_MISMATCH",
        "Renderer composition does not match the requested visual target.",
        {
          rendererCompositionPath,
          compositionPath: input.compositionPath,
        },
      )
    }
  }

  return identity.dirtyGeneration ?? null
}

export async function resolveVisualCompositionTarget(
  input: VisualCompositionTargetInput,
): Promise<VisualCompositionTarget> {
  const projectPath = resolve(input.projectPath)
  const projectRealPath = await realpath(projectPath)
  const requestedSourcePath = resolve(input.sourcePath ?? projectPath)
  const source = await realpathOrFallbackSource({
    projectRealPath,
    projectPath,
    sourcePath: requestedSourcePath,
    allowMissingSourceFallback: input.allowMissingSourceFallback ?? false,
  })

  const entryPath = await readProjectEntryPath(source.sourcePath)
  const compositionPath = normalizeProjectRelativePath(
    input.compositionPath?.trim() || entryPath,
    "Composition path",
  )
  const compositionFilePath = resolve(source.sourcePath, compositionPath)

  let compositionRealPath: string
  try {
    const info = await stat(compositionFilePath)
    if (!info.isFile()) {
      throw new Error("not a file")
    }
    compositionRealPath = await realpath(compositionFilePath)
  } catch (error) {
    if (error instanceof VisualCompositionTargetError) throw error
    throw new VisualCompositionTargetError(
      "COMPOSITION_MISSING",
      "Visual composition file does not exist.",
      { compositionPath },
    )
  }

  if (!isPathInsideDirectory(source.sourceRealPath, compositionRealPath)) {
    throw new VisualCompositionTargetError(
      "COMPOSITION_SYMLINK_ESCAPE",
      "Visual composition file resolves outside the source workspace.",
      { compositionPath },
    )
  }

  const rendererDirtyGeneration = await assertRendererIdentity({
    projectRealPath,
    sourceRealPath: source.sourceRealPath,
    compositionPath,
    rendererIdentity: input.rendererIdentity,
  })

  return {
    projectPath,
    projectRealPath,
    sourcePath: source.sourcePath,
    sourceRealPath: source.sourceRealPath,
    sourceRevisionId: input.sourceRevisionId ?? null,
    entryPath,
    compositionPath,
    compositionFilePath,
    compositionRealPath,
    isEntryComposition: compositionPath === entryPath,
    fallbackReason: source.fallbackReason,
    rendererDirtyGeneration,
  }
}
