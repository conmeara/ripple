import { readFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import type { ScaffoldCompositionMetadata } from "./types"

export interface HyperframesProjectMetadata {
  name?: string
  entry?: string
  width?: number
  height?: number
  fps?: number
  compositions?: unknown
}

export class RippleProjectMetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleProjectMetadataError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

function labelFromFilePath(filePath: string): string {
  const name = basename(filePath, extname(filePath))
  if (name === "index") return "Main"
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Composition"
}

function dataIdFromFilePath(filePath: string, entry: string): string {
  if (filePath === entry || basename(filePath) === "index.html") return "main"
  return basename(filePath, extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "composition"
}

export function parseHyperframesMetadata(raw: string): HyperframesProjectMetadata {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RippleProjectMetadataError(
      "hyperframes.json is malformed. Fix the project metadata and try again.",
    )
  }

  if (!isRecord(parsed)) {
    throw new RippleProjectMetadataError(
      "hyperframes.json must contain a project metadata object.",
    )
  }

  return parsed as HyperframesProjectMetadata
}

export async function readHyperframesMetadata(
  projectPath: string,
): Promise<HyperframesProjectMetadata> {
  const metadataPath = join(projectPath, "hyperframes.json")
  let raw: string
  try {
    raw = await readFile(metadataPath, "utf8")
  } catch (error) {
    throw new RippleProjectMetadataError(
      `Could not read hyperframes.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  return parseHyperframesMetadata(raw)
}

export function discoverDeclaredCompositions(
  metadata: HyperframesProjectMetadata,
  fallback: {
    entry: string
    width: number
    height: number
  },
): ScaffoldCompositionMetadata[] {
  const entry = stringValue(metadata.entry) ?? fallback.entry
  const projectWidth = positiveInteger(metadata.width, fallback.width)
  const projectHeight = positiveInteger(metadata.height, fallback.height)
  const declared = Array.isArray(metadata.compositions)
    ? metadata.compositions
    : []
  const discovered = new Map<string, ScaffoldCompositionMetadata>()

  const addComposition = (composition: ScaffoldCompositionMetadata) => {
    discovered.set(composition.filePath, composition)
  }

  addComposition({
    name: "Main",
    filePath: entry,
    dataCompositionId: "main",
    width: projectWidth,
    height: projectHeight,
    kind: "root",
  })

  for (const item of declared) {
    if (typeof item === "string") {
      const filePath = stringValue(item)
      if (!filePath) {
        throw new RippleProjectMetadataError(
          "hyperframes.json includes an empty composition path.",
        )
      }

      addComposition({
        name: labelFromFilePath(filePath),
        filePath,
        dataCompositionId: dataIdFromFilePath(filePath, entry),
        width: projectWidth,
        height: projectHeight,
        kind: filePath === entry ? "root" : "external",
        parentDataCompositionId: filePath === entry ? undefined : "main",
      })
      continue
    }

    if (!isRecord(item)) {
      throw new RippleProjectMetadataError(
        "hyperframes.json compositions must be file paths or metadata objects.",
      )
    }

    const filePath =
      stringValue(item.filePath) ??
      stringValue(item.path) ??
      stringValue(item.src)
    if (!filePath) {
      throw new RippleProjectMetadataError(
        "hyperframes.json composition metadata is missing a file path.",
      )
    }

    const dataCompositionId =
      stringValue(item.dataCompositionId) ??
      stringValue(item.id) ??
      dataIdFromFilePath(filePath, entry)
    const kind =
      item.kind === "root" || filePath === entry ? "root" : "external"
    const parentDataCompositionId =
      stringValue(item.parentDataCompositionId) ??
      stringValue(item.parentId) ??
      (kind === "external" ? "main" : undefined)

    addComposition({
      name: stringValue(item.name) ?? labelFromFilePath(filePath),
      filePath,
      dataCompositionId,
      width: positiveInteger(item.width, projectWidth),
      height: positiveInteger(item.height, projectHeight),
      kind,
      parentDataCompositionId,
    })
  }

  return Array.from(discovered.values())
}
