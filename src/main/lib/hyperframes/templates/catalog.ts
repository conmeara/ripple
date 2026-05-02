import { existsSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import {
  isRippleTemplateTarget,
  rippleTemplateCategories,
  rippleTemplateSourceKinds,
  rippleTemplateTargets,
  sortRippleTemplates,
  templateSupportsTarget,
  toRippleTemplateView,
  type RippleTemplateDefinition,
  type RippleTemplateBundleFile,
  type RippleTemplateManifest,
  type RippleTemplateTarget,
  type RippleTemplateView,
} from "../../../../shared/hyperframes-templates"

export class RippleTemplateCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleTemplateCatalogError"
  }
}

export interface RippleTemplateCatalog {
  root: string
  manifest: RippleTemplateManifest
  templates: RippleTemplateDefinition[]
}

const manifestFileName = "manifest.json"
let catalogCache: Promise<RippleTemplateCatalog> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value.trim()
  throw new RippleTemplateCatalogError(`Template manifest is missing ${field}.`)
}

function stringArrayValue(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new RippleTemplateCatalogError(`Template manifest ${field} must be a list.`)
  }

  return value.map((item, index) => stringValue(item, `${field}[${index}]`))
}

function numberValue(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  throw new RippleTemplateCatalogError(`Template manifest ${field} must be positive.`)
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function nullableBundleRelativePathValue(value: unknown): string | null {
  const filePath = nullableStringValue(value)
  return filePath ? normalizeBundleRelativePath(filePath) : null
}

function normalizeBundleRelativePath(filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new RippleTemplateCatalogError("Template bundle paths must be relative.")
  }

  const normalized = normalize(filePath).replace(/\\/g, "/")
  const segments = normalized.split("/")
  if (!normalized || normalized === "." || segments.includes("..")) {
    throw new RippleTemplateCatalogError("Template bundle path escapes the bundle.")
  }

  return normalized
}

export function resolveTemplateBundlePath(root: string, filePath: string): string {
  const normalized = normalizeBundleRelativePath(filePath)
  const bundleRoot = resolve(root)
  const resolved = resolve(bundleRoot, normalized)
  const relative = normalize(resolved).startsWith(normalize(bundleRoot) + sep) ||
    normalize(resolved) === normalize(bundleRoot)
  if (!relative) {
    throw new RippleTemplateCatalogError("Template bundle path escapes the bundle.")
  }

  return resolved
}

function parseTemplateFile(
  value: unknown,
  templateId: string,
  index: number,
): RippleTemplateBundleFile {
  if (!isRecord(value)) {
    throw new RippleTemplateCatalogError(`${templateId} sourceFiles[${index}] is invalid.`)
  }

  const type = stringValue(value.type, `${templateId}.sourceFiles[${index}].type`)
  if (
    type !== "composition" &&
    type !== "asset" &&
    type !== "metadata" &&
    type !== "snippet"
  ) {
    throw new RippleTemplateCatalogError(`${templateId} sourceFiles[${index}] has an unsupported type.`)
  }

  return {
    source: normalizeBundleRelativePath(
      stringValue(value.source, `${templateId}.sourceFiles[${index}].source`),
    ),
    target: stringValue(value.target, `${templateId}.sourceFiles[${index}].target`),
    type: type as RippleTemplateBundleFile["type"],
  }
}

function parseVisual(value: unknown, templateId: string): RippleTemplateDefinition["visual"] {
  if (!isRecord(value)) {
    throw new RippleTemplateCatalogError(`${templateId} visual metadata is missing.`)
  }

  const motif = stringValue(value.motif, `${templateId}.visual.motif`)
  if (
    motif !== "minimal" &&
    motif !== "grain" &&
    motif !== "burst" &&
    motif !== "grid" &&
    motif !== "type" &&
    motif !== "diagram" &&
    motif !== "product" &&
    motif !== "chart" &&
    motif !== "card"
  ) {
    throw new RippleTemplateCatalogError(`${templateId} visual motif is unsupported.`)
  }

  return {
    eyebrow: stringValue(value.eyebrow, `${templateId}.visual.eyebrow`),
    title: stringValue(value.title, `${templateId}.visual.title`),
    subtitle: stringValue(value.subtitle, `${templateId}.visual.subtitle`),
    background: stringValue(value.background, `${templateId}.visual.background`),
    surface: stringValue(value.surface, `${templateId}.visual.surface`),
    accent: stringValue(value.accent, `${templateId}.visual.accent`),
    ink: stringValue(value.ink, `${templateId}.visual.ink`),
    secondary: stringValue(value.secondary, `${templateId}.visual.secondary`),
    motif,
  }
}

function parseTemplate(value: unknown): RippleTemplateDefinition {
  if (!isRecord(value)) {
    throw new RippleTemplateCatalogError("Template manifest includes an invalid template.")
  }

  const id = stringValue(value.id, "template.id")
  const category = stringValue(value.category, `${id}.category`)
  if (!rippleTemplateCategories.includes(category as RippleTemplateDefinition["category"])) {
    throw new RippleTemplateCatalogError(`${id} has an unsupported category.`)
  }

  const sourceKind = stringValue(value.sourceKind, `${id}.sourceKind`)
  if (!rippleTemplateSourceKinds.includes(sourceKind as RippleTemplateDefinition["sourceKind"])) {
    throw new RippleTemplateCatalogError(`${id} has an unsupported source kind.`)
  }

  const supportedTargets = stringArrayValue(value.supportedTargets, `${id}.supportedTargets`)
  for (const target of supportedTargets) {
    if (!isRippleTemplateTarget(target)) {
      throw new RippleTemplateCatalogError(`${id} supports an unknown target.`)
    }
  }

  const sourceFilesValue = value.sourceFiles
  if (!Array.isArray(sourceFilesValue) || sourceFilesValue.length === 0) {
    throw new RippleTemplateCatalogError(`${id} must include source files.`)
  }

  return {
    id,
    name: stringValue(value.name, `${id}.name`),
    description: stringValue(value.description, `${id}.description`),
    category: category as RippleTemplateDefinition["category"],
    sourceKind: sourceKind as RippleTemplateDefinition["sourceKind"],
    supportedTargets: supportedTargets as RippleTemplateTarget[],
    width: Math.round(numberValue(value.width, `${id}.width`)),
    height: Math.round(numberValue(value.height, `${id}.height`)),
    fps: Math.round(numberValue(value.fps, `${id}.fps`)),
    durationSeconds: numberValue(value.durationSeconds, `${id}.durationSeconds`),
    previewPosterPath: normalizeBundleRelativePath(
      stringValue(value.previewPosterPath, `${id}.previewPosterPath`),
    ),
    previewVideoPath: nullableBundleRelativePathValue(value.previewVideoPath),
    sourceUrl: stringValue(value.sourceUrl, `${id}.sourceUrl`),
    license: stringValue(value.license, `${id}.license`),
    compatibility: stringValue(value.compatibility, `${id}.compatibility`),
    version: stringValue(value.version, `${id}.version`),
    sourceFiles: sourceFilesValue.map((file, index) => parseTemplateFile(file, id, index)),
    requiredAssets: stringArrayValue(value.requiredAssets, `${id}.requiredAssets`).map(
      normalizeBundleRelativePath,
    ),
    visual: parseVisual(value.visual, id),
  }
}

function parseManifest(raw: string): RippleTemplateManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RippleTemplateCatalogError("Template manifest is malformed.")
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.templates)) {
    throw new RippleTemplateCatalogError("Template manifest must include templates.")
  }

  const templates = parsed.templates.map(parseTemplate)
  const ids = new Set<string>()
  for (const template of templates) {
    if (ids.has(template.id)) {
      throw new RippleTemplateCatalogError(`Duplicate template id: ${template.id}.`)
    }
    ids.add(template.id)
  }

  if (!ids.has("blank")) {
    throw new RippleTemplateCatalogError("Template manifest must include Blank.")
  }

  return {
    version: stringValue(parsed.version, "manifest.version"),
    generatedAt: stringValue(parsed.generatedAt, "manifest.generatedAt"),
    templates,
  }
}

function getCandidateBundleRoots(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const candidates = [
    join(process.cwd(), "resources", "hyperframes-templates"),
  ]

  if (resourcesPath) {
    candidates.unshift(join(resourcesPath, "hyperframes-templates"))
  }

  return Array.from(new Set(candidates))
}

export function getHyperframesTemplateBundleRoot(): string {
  const found = getCandidateBundleRoots().find((candidate) =>
    existsSync(join(candidate, manifestFileName)),
  )

  if (!found) {
    throw new RippleTemplateCatalogError("Ripple template bundle is missing.")
  }

  return found
}

async function assertTemplateFile(root: string, filePath: string): Promise<void> {
  const absolutePath = resolveTemplateBundlePath(root, filePath)
  const fileStat = await stat(absolutePath)
  if (!fileStat.isFile()) {
    throw new RippleTemplateCatalogError(`Template bundle path is not a file: ${filePath}`)
  }
}

async function loadCatalogUncached(root: string): Promise<RippleTemplateCatalog> {
  const manifestPath = join(root, manifestFileName)
  const manifest = parseManifest(await readFile(manifestPath, "utf8"))

  for (const template of manifest.templates) {
    await assertTemplateFile(root, template.previewPosterPath)
    if (template.previewVideoPath) {
      await assertTemplateFile(root, template.previewVideoPath)
    }
    for (const file of template.sourceFiles) {
      await assertTemplateFile(root, file.source)
    }
    for (const asset of template.requiredAssets) {
      await assertTemplateFile(root, asset)
    }
  }

  return {
    root,
    manifest,
    templates: manifest.templates,
  }
}

export function loadRippleTemplateCatalog(input: {
  bundleRoot?: string
} = {}): Promise<RippleTemplateCatalog> {
  if (input.bundleRoot) {
    return loadCatalogUncached(input.bundleRoot)
  }

  catalogCache ??= loadCatalogUncached(getHyperframesTemplateBundleRoot())
  return catalogCache
}

function getMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  if (extension === ".svg") return "image/svg+xml"
  if (extension === ".png") return "image/png"
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".mp4") return "video/mp4"
  if (extension === ".webm") return "video/webm"
  if (extension === ".mov") return "video/quicktime"
  return "application/octet-stream"
}

async function loadPreviewDataUrl(
  catalog: RippleTemplateCatalog,
  filePath: string | null,
): Promise<string | null> {
  if (!filePath) return null

  try {
    const buffer = await readFile(resolveTemplateBundlePath(catalog.root, filePath))
    return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`
  } catch {
    return null
  }
}

export async function listRippleTemplateViews(input: {
  target?: RippleTemplateTarget
  bundleRoot?: string
} = {}): Promise<RippleTemplateView[]> {
  const catalog = await loadRippleTemplateCatalog({ bundleRoot: input.bundleRoot })
  const templates = sortRippleTemplates(catalog.templates, input.target)

  return Promise.all(
    templates.map(async (template) =>
      toRippleTemplateView(
        template,
        await loadPreviewDataUrl(catalog, template.previewPosterPath),
        await loadPreviewDataUrl(catalog, template.previewVideoPath ?? null),
      ),
    ),
  )
}

export async function getRippleTemplateForTarget(input: {
  templateId?: string | null
  target: RippleTemplateTarget
  bundleRoot?: string
}): Promise<RippleTemplateDefinition> {
  if (!rippleTemplateTargets.includes(input.target)) {
    throw new RippleTemplateCatalogError("Template target is not supported.")
  }

  const catalog = await loadRippleTemplateCatalog({ bundleRoot: input.bundleRoot })
  const templateId = input.templateId?.trim() || "blank"
  const template = catalog.templates.find((item) => item.id === templateId)

  if (!template || !templateSupportsTarget(template, input.target)) {
    throw new RippleTemplateCatalogError("This template is not available here.")
  }

  return template
}

export function clearRippleTemplateCatalogCache(): void {
  catalogCache = null
}
