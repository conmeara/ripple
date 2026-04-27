export type RippleProjectAssetKind = "image" | "video" | "audio" | "font" | "other"

export interface RippleProjectCompositionRecord {
  id: string
  name: string
  filePath: string
  dataCompositionId: string
  width: number
  height: number
  parentCompositionId: string | null
  kind: string
}

export interface RippleProjectCompositionItem {
  id: string
  name: string
  filePath: string
  dataCompositionId: string
  width: number
  height: number
  parentCompositionId: string | null
  kind: string
  aspectRatioLabel: string
  isActive: boolean
}

export interface RippleProjectAssetItem {
  id: string
  name: string
  label: string
  relativePath: string
  directory: string
  extension: string
  kind: RippleProjectAssetKind
  mimeType: string
  sizeBytes: number
  modifiedAt: Date
  previewUrl: string | null
}

export interface RippleProjectBrowserProject {
  id: string
  name: string
  activeCompositionId: string | null
  setupStatus: "unknown" | "checking" | "ready" | "needs_environment" | "error"
  setupError: string | null
}

export interface RippleProjectBrowserModel {
  project: RippleProjectBrowserProject
  compositions: RippleProjectCompositionItem[]
  assets: RippleProjectAssetItem[]
  generatedAt: Date
}

const assetExtensionsByKind: Record<Exclude<RippleProjectAssetKind, "other">, Set<string>> = {
  image: new Set([".apng", ".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]),
  video: new Set([".m4v", ".mov", ".mp4", ".webm"]),
  audio: new Set([".aac", ".aif", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".wav"]),
  font: new Set([".otf", ".ttf", ".woff", ".woff2"]),
}

const generatedAssetPatterns = [
  /^assets\/vendor(?:\/|$)/i,
  /^assets\/__hyperframes(?:\/|$)/i,
  /^assets\/node_modules(?:\/|$)/i,
  /^assets\/\.ripple(?:\/|$)/i,
]

const assetKindOrder: Record<RippleProjectAssetKind, number> = {
  image: 0,
  video: 1,
  audio: 2,
  font: 3,
  other: 4,
}

function getExtension(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath
  const index = fileName.lastIndexOf(".")
  return index > 0 ? fileName.slice(index).toLowerCase() : ""
}

function fileNameFromPath(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

function directoryFromPath(filePath: string): string {
  const index = filePath.lastIndexOf("/")
  return index >= 0 ? filePath.slice(0, index) : ""
}

export function getRippleProjectAssetKind(filePath: string): RippleProjectAssetKind {
  const extension = getExtension(filePath)
  for (const [kind, extensions] of Object.entries(assetExtensionsByKind)) {
    if (extensions.has(extension)) return kind as RippleProjectAssetKind
  }

  return "other"
}

export function isGeneratedRippleProjectAssetPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/")
  const fileName = fileNameFromPath(normalized)

  return fileName.startsWith(".") ||
    generatedAssetPatterns.some((pattern) => pattern.test(normalized))
}

export function isVisibleRippleProjectAssetPath(filePath: string): boolean {
  return !isGeneratedRippleProjectAssetPath(filePath) &&
    getRippleProjectAssetKind(filePath) !== "other"
}

export function isImportableRippleProjectMediaPath(filePath: string): boolean {
  const kind = getRippleProjectAssetKind(filePath)
  return kind === "image" || kind === "video" || kind === "audio"
}

export function labelFromProjectFilePath(filePath: string, fallback = "Asset"): string {
  const fileName = fileNameFromPath(filePath).replace(/\.[a-z0-9]+$/i, "")
  const label = fileName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

  return label || fallback
}

export function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const formatted = value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

export function toRippleProjectCompositionItem(
  composition: RippleProjectCompositionRecord,
  activeCompositionId: string | null | undefined,
): RippleProjectCompositionItem {
  const width = Number.isFinite(composition.width) ? Math.max(1, Math.round(composition.width)) : 1
  const height = Number.isFinite(composition.height) ? Math.max(1, Math.round(composition.height)) : 1

  return {
    id: composition.id,
    name: composition.name || labelFromProjectFilePath(composition.filePath, "Composition"),
    filePath: composition.filePath,
    dataCompositionId: composition.dataCompositionId,
    width,
    height,
    parentCompositionId: composition.parentCompositionId,
    kind: composition.kind,
    aspectRatioLabel: `${width}x${height}`,
    isActive: composition.id === activeCompositionId,
  }
}

export function sortRippleProjectCompositions(
  compositions: RippleProjectCompositionItem[],
): RippleProjectCompositionItem[] {
  return [...compositions].sort((a, b) => a.filePath.localeCompare(b.filePath))
}

export function markActiveRippleProjectCompositions(
  compositions: RippleProjectCompositionItem[],
  activeCompositionId: string | null | undefined,
): RippleProjectCompositionItem[] {
  return compositions.map((composition) => ({
    ...composition,
    isActive: composition.id === activeCompositionId,
  }))
}

export function createRippleProjectAssetItem(input: {
  projectId: string
  relativePath: string
  mimeType: string
  sizeBytes: number
  modifiedAt: Date
  previewUrl: string | null
}): RippleProjectAssetItem {
  const relativePath = input.relativePath.replace(/\\/g, "/")
  const name = fileNameFromPath(relativePath)
  const extension = getExtension(relativePath)

  return {
    id: `${input.projectId}:${relativePath}`,
    name,
    label: labelFromProjectFilePath(relativePath),
    relativePath,
    directory: directoryFromPath(relativePath),
    extension,
    kind: getRippleProjectAssetKind(relativePath),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    modifiedAt: input.modifiedAt,
    previewUrl: input.previewUrl,
  }
}

export function sortRippleProjectAssets(
  assets: RippleProjectAssetItem[],
): RippleProjectAssetItem[] {
  return [...assets].sort((a, b) => {
    const kindDifference = assetKindOrder[a.kind] - assetKindOrder[b.kind]
    if (kindDifference !== 0) return kindDifference
    if (a.directory !== b.directory) return a.directory.localeCompare(b.directory)
    return a.label.localeCompare(b.label)
  })
}
