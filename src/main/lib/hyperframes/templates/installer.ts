import { eq } from "drizzle-orm"
import { readFile, mkdir, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, extname, join } from "node:path"
import { compositions, projects, type Composition, type Project } from "../../db/schema"
import type { ScaffoldMetadata, ScaffoldResult } from "../../ripple-projects/types"
import { ensureRippleProjectAgentNotes } from "../../ripple-projects/project-agent-notes"
import {
  readHyperframesMetadata,
  type HyperframesProjectMetadata,
} from "../../ripple-projects/metadata"
import {
  assertHyperframesProjectFiles,
  normalizeProjectRelativePath,
  resolveHyperframesProjectContext,
  resolveProjectRelativePath,
} from "../project-context"
import { refreshHyperframesCompositions } from "../compositions"
import type { HyperframesCompositionRefreshResult, HyperframesProjectContext } from "../types"
import {
  getRippleTemplateForTarget,
  loadRippleTemplateCatalog,
  resolveTemplateBundlePath,
} from "./catalog"
import type {
  RippleTemplateBundleFile,
  RippleTemplateDefinition,
} from "../../../../shared/hyperframes-templates"

const require = createRequire(import.meta.url)

export class RippleTemplateInstallError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RippleTemplateInstallError"
  }
}

export interface CreateTemplateCompositionResult {
  project: Project
  composition: Composition
  compositions: Composition[]
  installedPath: string
}

export interface InstallCompositionTemplateFilesResult {
  template: RippleTemplateDefinition
  filePath: string
  dataCompositionId: string
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

async function writeGeneratedFile(filePath: string, content: string | Buffer): Promise<void> {
  if (await pathExists(filePath)) {
    const existing = await readFile(filePath)
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8")
    if (!existing.equals(next)) {
      throw new RippleTemplateInstallError(
        `Refusing to overwrite an existing generated file: ${filePath}`,
      )
    }
    return
  }

  await writeFile(filePath, content)
}

async function readBundledGsapRuntime(): Promise<Buffer> {
  try {
    const gsapPath = require.resolve("gsap/dist/gsap.min.js")
    return await readFile(gsapPath)
  } catch (error) {
    throw new RippleTemplateInstallError(
      `Ripple could not prepare the bundled animation runtime: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatTemplateNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

function safeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "composition"
}

function tokenValues(input: {
  template: RippleTemplateDefinition
  projectName?: string
  compositionId?: string
  width?: number
  height?: number
  fps?: number
}): Record<string, string> {
  const duration = input.template.durationSeconds
  const width = input.width ?? input.template.width
  const height = input.height ?? input.template.height
  const fps = input.fps ?? input.template.fps
  const titleDuration = Math.max(0.5, duration - 0.7)
  const subtitleDuration = Math.max(0.5, duration - 0.9)
  const cardDuration = Math.max(0.5, duration - 1)
  const title = input.projectName || input.template.visual.title
  const initial = input.template.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "R"

  return {
    PROJECT_NAME: escapeHtml(title),
    TEMPLATE_ID: escapeHtml(input.template.id),
    COMPOSITION_ID: escapeHtml(input.compositionId ?? input.template.id),
    WIDTH: String(width),
    HEIGHT: String(height),
    FPS: String(fps),
    DURATION: formatTemplateNumber(duration),
    TITLE_DURATION: formatTemplateNumber(titleDuration),
    SUBTITLE_DURATION: formatTemplateNumber(subtitleDuration),
    CARD_DURATION: formatTemplateNumber(cardDuration),
    AVATAR_DURATION: formatTemplateNumber(Math.max(0.5, duration - 0.4)),
    TEXT_DURATION: formatTemplateNumber(Math.max(0.5, duration - 0.6)),
    PROGRESS_DURATION: formatTemplateNumber(Math.max(0.5, duration - 1.2)),
    EYEBROW: escapeHtml(input.template.visual.eyebrow),
    TITLE: escapeHtml(title),
    SUBTITLE: escapeHtml(input.template.visual.subtitle),
    BACKGROUND: input.template.visual.background,
    SURFACE: input.template.visual.surface,
    ACCENT: input.template.visual.accent,
    INK: input.template.visual.ink,
    SECONDARY: input.template.visual.secondary,
    MOTIF: input.template.visual.motif,
    INITIAL: escapeHtml(initial),
  }
}

function getRelativeRuntimePath(targetPath: string): string {
  const directory = dirname(normalizeProjectRelativePath(targetPath)).replace(/\\/g, "/")
  if (directory === ".") return "./assets/vendor/gsap.min.js"
  const depth = directory.split("/").filter(Boolean).length
  return `${"../".repeat(depth)}assets/vendor/gsap.min.js`
}

function sanitizeTemplateHtml(source: string, runtimePath: string): string {
  return source
    .replace(/\s+xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/gi, "")
    .replace(/\s+xmlns=(["'])http:\/\/www\.w3\.org\/1999\/xlink\1/gi, "")
    .replace(/@import\s+url\(["']https:\/\/fonts\.googleapis\.com[^)]*\)\s*;\s*/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.googleapis\.com[^>]+>\s*/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.gstatic\.com[^>]+>\s*/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.googleapis\.com[^>]*>\s*/gi, "")
    .replace(/<link[^>]+href=["']https:\/\/fonts\.gstatic\.com[^>]*>\s*/gi, "")
    .replace(/<script[^>]+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/gsap[^"']*["'][^>]*><\/script>/gi, `<script src="${runtimePath}"></script>`)
    .replace(/<script[^>]+src=["']https:\/\/unpkg\.com\/gsap[^"']*["'][^>]*><\/script>/gi, `<script src="${runtimePath}"></script>`)
}

function getRenderNetworkUrls(source: string): string[] {
  const urls = source.match(/https?:\/\/[^"'\s)<>]+/gi) ?? []
  return urls.filter((url) =>
    !url.startsWith("http://www.w3.org/2000/svg") &&
    !url.startsWith("http://www.w3.org/1999/xlink")
  )
}

function normalizeCompositionIdentity(
  source: string,
  template: RippleTemplateDefinition,
  dataCompositionId: string,
): string {
  if (dataCompositionId === template.id) {
    return source.replaceAll(`${template.id}-demo`, dataCompositionId)
  }

  return source
    .replaceAll(`${template.id}-demo`, dataCompositionId)
    .replaceAll(template.id, dataCompositionId)
}

function renderTemplateSource(
  source: string,
  values: Record<string, string>,
  options: {
    runtimePath: string
    template?: RippleTemplateDefinition
    dataCompositionId?: string
    assetPathReplacements?: Array<[string, string]>
  },
): string {
  const tokenizedValues: Record<string, string> = {
    ...values,
    RUNTIME_PATH: escapeHtml(options.runtimePath),
  }
  const withTokens = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => {
    return tokenizedValues[key] ?? ""
  })
  const withIdentity = options.template && options.dataCompositionId
    ? normalizeCompositionIdentity(withTokens, options.template, options.dataCompositionId)
    : withTokens
  const withAssetPaths = (options.assetPathReplacements ?? []).reduce(
    (content, [from, to]) => content.replaceAll(from, to),
    withIdentity,
  )
  const rendered = sanitizeTemplateHtml(withAssetPaths, options.runtimePath)

  const networkUrls = getRenderNetworkUrls(rendered)
  if (networkUrls.length > 0) {
    throw new RippleTemplateInstallError(
      "Template content contains a network URL. Bundle the dependency locally first.",
    )
  }

  return rendered
}

async function readTemplateSource(template: RippleTemplateDefinition, source: string): Promise<string> {
  const catalog = await loadRippleTemplateCatalog()
  return readFile(resolveTemplateBundlePath(catalog.root, source), "utf8")
}

function getGitIgnore(): string {
  return `# Ripple generated output
exports/
snapshots/
.ripple/snapshots/
.ripple/frame-sheets/
.ripple/comment-visuals/
.ripple/tmp/
.ripple/agent-attachments/
node_modules/
.DS_Store
`
}

function getHyperframesJson(input: {
  metadata: ScaffoldMetadata
  template: RippleTemplateDefinition
}): string {
  return `${JSON.stringify(
    {
      name: input.metadata.projectName,
      entry: "index.html",
      width: input.metadata.width,
      height: input.metadata.height,
      fps: input.metadata.fps,
      duration: input.template.durationSeconds,
      templateId: input.template.id,
      compositions: ["index.html"],
    },
    null,
    2,
  )}
`
}

function getMetaJson(input: {
  metadata: ScaffoldMetadata
  template: RippleTemplateDefinition
}): string {
  return `${JSON.stringify(
    {
      app: "Ripple",
      projectName: input.metadata.projectName,
      slug: input.metadata.slug,
      aspectRatioPreset: input.metadata.aspectRatioPreset,
      templateId: input.template.id,
      templateName: input.template.name,
      width: input.metadata.width,
      height: input.metadata.height,
      fps: input.metadata.fps,
      createdWith: "ripple-phase-12",
      localFirst: true,
    },
    null,
    2,
  )}
`
}

function getProjectTemplateSource(template: RippleTemplateDefinition): RippleTemplateBundleFile {
  const source = template.sourceFiles.find(
    (file) => file.type === "composition" && file.target === "index.html",
  )
  if (source) return source

  const compositionSource = template.sourceFiles.find(
    (file) => file.type === "composition" && !isProjectEntryTemplateFile(file.target),
  )
  if (!compositionSource) {
    throw new RippleTemplateInstallError("This template cannot create a project.")
  }
  return compositionSource
}

function isProjectEntryTemplateFile(target: string): boolean {
  return normalizeProjectRelativePath(target) === "index.html"
}

function getCompositionTemplateSourceFile(template: RippleTemplateDefinition): RippleTemplateBundleFile {
  const source = template.sourceFiles.find(
    (file) => file.type === "composition" && !isProjectEntryTemplateFile(file.target),
  )
  if (!source) {
    throw new RippleTemplateInstallError("This template cannot create a composition.")
  }
  return source
}

function getCompositionTemplateSource(template: RippleTemplateDefinition): string {
  return getCompositionTemplateSourceFile(template).source
}

async function copyTemplateCompanionFiles(input: {
  context: HyperframesProjectContext
  template: RippleTemplateDefinition
  compositionSource: string
}): Promise<void> {
  for (const file of input.template.sourceFiles) {
    if (file.type === "composition" && file.source === input.compositionSource) continue
    if (file.type === "composition" && isProjectEntryTemplateFile(file.target)) continue

    const destination = resolveProjectRelativePath(input.context, file.target)
    await mkdir(dirname(destination), { recursive: true })

    const sourcePath = resolveTemplateBundlePath(
      (await loadRippleTemplateCatalog()).root,
      file.source,
    )

    if (file.type === "asset") {
      await writeGeneratedFile(destination, await readFile(sourcePath))
      continue
    }

    const source = await readFile(sourcePath, "utf8")
    const rendered = renderTemplateSource(source, tokenValues({ template: input.template }), {
      runtimePath: getRelativeRuntimePath(file.target),
    })
    await writeGeneratedFile(destination, rendered)
  }
}

async function copyProjectTemplateCompanionFiles(input: {
  projectPath: string
  template: RippleTemplateDefinition
  projectSource: string
}): Promise<void> {
  for (const file of input.template.sourceFiles) {
    if (file.source === input.projectSource) continue
    if (file.type === "composition" && isProjectEntryTemplateFile(file.target)) continue

    const relativeTarget = normalizeProjectRelativePath(file.target)
    const destination = join(input.projectPath, relativeTarget)
    await mkdir(dirname(destination), { recursive: true })

    const sourcePath = resolveTemplateBundlePath(
      (await loadRippleTemplateCatalog()).root,
      file.source,
    )

    if (file.type === "asset") {
      await writeGeneratedFile(destination, await readFile(sourcePath))
      continue
    }

    const source = await readFile(sourcePath, "utf8")
    const rendered = renderTemplateSource(source, tokenValues({ template: input.template }), {
      runtimePath: getRelativeRuntimePath(relativeTarget),
    })
    await writeGeneratedFile(destination, rendered)
  }
}

function getAssetPathReplacements(template: RippleTemplateDefinition): Array<[string, string]> {
  const prefix = `catalog/${template.id}/`

  return template.sourceFiles
    .filter((file) => file.type === "asset" && file.source.startsWith(prefix))
    .map((file) => [file.source.slice(prefix.length), file.target])
}

export async function installRippleProjectTemplate(input: {
  projectPath: string
  metadata: ScaffoldMetadata
}): Promise<ScaffoldResult> {
  const template = await getRippleTemplateForTarget({
    templateId: input.metadata.templateId,
    target: "new-project",
  })
  const projectSource = getProjectTemplateSource(template)
  const usesCompositionSource = !isProjectEntryTemplateFile(projectSource.target)
  const source = await readTemplateSource(template, projectSource.source)
  const html = renderTemplateSource(source, tokenValues({
    template,
    projectName: input.metadata.projectName,
    width: input.metadata.width,
    height: input.metadata.height,
    fps: input.metadata.fps,
  }), {
    runtimePath: "./assets/vendor/gsap.min.js",
    template: usesCompositionSource ? template : undefined,
    dataCompositionId: usesCompositionSource ? "main" : undefined,
    assetPathReplacements: usesCompositionSource ? getAssetPathReplacements(template) : undefined,
  })

  await mkdir(join(input.projectPath, "compositions"), { recursive: true })
  await mkdir(join(input.projectPath, "assets", "vendor"), { recursive: true })
  await mkdir(join(input.projectPath, "exports"), { recursive: true })

  await writeGeneratedFile(join(input.projectPath, ".gitignore"), getGitIgnore())
  await writeGeneratedFile(join(input.projectPath, "index.html"), html)
  await writeGeneratedFile(
    join(input.projectPath, "hyperframes.json"),
    getHyperframesJson({ metadata: input.metadata, template }),
  )
  await writeGeneratedFile(
    join(input.projectPath, "meta.json"),
    getMetaJson({ metadata: input.metadata, template }),
  )
  await writeGeneratedFile(
    join(input.projectPath, "assets", "vendor", "gsap.min.js"),
    await readBundledGsapRuntime(),
  )
  await copyProjectTemplateCompanionFiles({
    projectPath: input.projectPath,
    template,
    projectSource: projectSource.source,
  })
  const agentNotes = await ensureRippleProjectAgentNotes(input.projectPath)

  return {
    projectPath: input.projectPath,
    agentNotes,
    compositions: [
      {
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: input.metadata.width,
        height: input.metadata.height,
        kind: "root",
      },
    ],
  }
}

export async function installCompositionTemplateFiles(input: {
  context: HyperframesProjectContext
  templateId: string
}): Promise<InstallCompositionTemplateFilesResult> {
  const template = await getRippleTemplateForTarget({
    templateId: input.templateId,
    target: "new-composition",
  })
  assertHyperframesProjectFiles(input.context.projectPath)

  await mkdir(resolveProjectRelativePath(input.context, "compositions"), { recursive: true })
  await mkdir(resolveProjectRelativePath(input.context, "assets/vendor"), { recursive: true })
  await writeGeneratedFile(
    resolveProjectRelativePath(input.context, "assets/vendor/gsap.min.js"),
    await readBundledGsapRuntime(),
  )

  const identity = await getAvailableCompositionIdentity({
    projectPath: input.context.projectPath,
    template,
  })
  const compositionSource = getCompositionTemplateSource(template)
  const source = await readTemplateSource(template, compositionSource)
  const html = renderTemplateSource(source, tokenValues({
    template,
    compositionId: identity.dataCompositionId,
  }), {
    runtimePath: getRelativeRuntimePath(identity.filePath),
    template,
    dataCompositionId: identity.dataCompositionId,
    assetPathReplacements: getAssetPathReplacements(template),
  })

  const destination = resolveProjectRelativePath(input.context, identity.filePath)
  await writeGeneratedFile(destination, html)
  await copyTemplateCompanionFiles({
    context: input.context,
    template,
    compositionSource,
  })

  const metadata = await readHyperframesMetadata(input.context.projectPath)
  await writeHyperframesMetadata({
    projectPath: input.context.projectPath,
    metadata: nextHyperframesMetadata({
      metadata,
      template,
      filePath: identity.filePath,
      dataCompositionId: identity.dataCompositionId,
    }),
  })

  return {
    template,
    filePath: identity.filePath,
    dataCompositionId: identity.dataCompositionId,
  }
}

function normalizeCompositionFileName(template: RippleTemplateDefinition): string {
  const fileName = `${safeIdentifier(template.id)}.html`
  const extension = extname(fileName).toLowerCase()
  return extension === ".html" ? fileName : `${basename(fileName, extension)}.html`
}

async function getAvailableCompositionIdentity(input: {
  projectPath: string
  template: RippleTemplateDefinition
}): Promise<{ filePath: string; dataCompositionId: string }> {
  const baseFileName = normalizeCompositionFileName(input.template)
  const baseName = basename(baseFileName, ".html")
  let index = 1

  while (true) {
    const suffix = index === 1 ? "" : `-${index}`
    const dataCompositionId = safeIdentifier(`${baseName}${suffix}`)
    const filePath = normalizeProjectRelativePath(
      `compositions/${dataCompositionId}.html`,
    )
    const absolutePath = join(input.projectPath, filePath)

    if (!(await pathExists(absolutePath))) {
      return { filePath, dataCompositionId }
    }

    index += 1
  }
}

function nextHyperframesMetadata(input: {
  metadata: HyperframesProjectMetadata
  template: RippleTemplateDefinition
  filePath: string
  dataCompositionId: string
}): Record<string, unknown> {
  const existing = Array.isArray(input.metadata.compositions)
    ? input.metadata.compositions
    : []
  const existingWithoutTarget = existing.filter((item) => {
    if (typeof item === "string") return item !== input.filePath
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      return record.filePath !== input.filePath && record.path !== input.filePath
    }
    return true
  })

  return {
    ...input.metadata,
    entry: typeof input.metadata.entry === "string" && input.metadata.entry.trim()
      ? input.metadata.entry
      : "index.html",
    width: input.metadata.width ?? 1920,
    height: input.metadata.height ?? 1080,
    compositions: [
      ...existingWithoutTarget,
      {
        name: input.template.name,
        filePath: input.filePath,
        dataCompositionId: input.dataCompositionId,
        width: input.template.width,
        height: input.template.height,
        kind: "external",
        parentDataCompositionId: "main",
      },
    ],
  }
}

async function writeHyperframesMetadata(input: {
  projectPath: string
  metadata: Record<string, unknown>
}): Promise<void> {
  await writeFile(
    join(input.projectPath, "hyperframes.json"),
    `${JSON.stringify(input.metadata, null, 2)}\n`,
    "utf8",
  )
}

async function updateActiveComposition(input: {
  projectId: string
  composition: Composition
}): Promise<Project> {
  const { getDatabase } = await import("../../db")
  const db = getDatabase()
  const project = db
    .update(projects)
    .set({
      activeCompositionId: input.composition.id,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId))
    .returning()
    .get()

  if (!project) {
    throw new RippleTemplateInstallError("Could not select the created composition.")
  }

  return project
}

function findInstalledComposition(input: {
  refresh: HyperframesCompositionRefreshResult
  projectId: string
  filePath: string
}): Composition {
  const composition = input.refresh.compositions.find(
    (item) => item.projectId === input.projectId && item.filePath === input.filePath,
  )

  if (!composition) {
    throw new RippleTemplateInstallError("The created composition could not be registered.")
  }

  return composition
}

export async function createCompositionFromTemplate(input: {
  projectId: string
  templateId: string
  setActive?: boolean
  repoRoot?: string
}): Promise<CreateTemplateCompositionResult> {
  const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
  const installedFiles = await installCompositionTemplateFiles({
    context,
    templateId: input.templateId,
  })

  const refresh = await refreshHyperframesCompositions({
    projectId: input.projectId,
    repoRoot: input.repoRoot,
  })
  const installed = findInstalledComposition({
    refresh,
    projectId: input.projectId,
    filePath: installedFiles.filePath,
  })

  const project = input.setActive === false
    ? refresh.project
    : await updateActiveComposition({ projectId: input.projectId, composition: installed })
  const { getDatabase } = await import("../../db")
  const compositionsAfterSelection = getDatabase()
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, input.projectId))
    .all()

  return {
    project,
    composition: installed,
    compositions: compositionsAfterSelection,
    installedPath: installedFiles.filePath,
  }
}
