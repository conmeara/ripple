import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { installCompositionTemplateFiles, installRippleProjectTemplate } from "../src/main/lib/hyperframes/templates/installer"
import {
  loadRippleTemplateCatalog,
  type RippleTemplateCatalog,
} from "../src/main/lib/hyperframes/templates/catalog"
import type { RippleTemplateDefinition, RippleTemplateManifest } from "../src/shared/hyperframes-templates"

const bundleRoot = join(process.cwd(), "resources", "hyperframes-templates")
const manifestPath = join(bundleRoot, "manifest.json")
const previewVideoDirectory = "previews/videos"
const previewProjectPosterDirectory = "previews/projects"
const previewPosterSeekSeconds = 1
const maxPreviewDimension = 960
const previewFps = 24

interface Options {
  force: boolean
  keepTemp: boolean
  templateIds: Set<string> | null
}

interface PreviewSize {
  width: number
  height: number
  scale: number
}

function parseOptions(): Options {
  const args = process.argv.slice(2)
  const templateIds = new Set<string>()
  let force = false
  let keepTemp = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--force") {
      force = true
      continue
    }
    if (arg === "--keep-temp") {
      keepTemp = true
      continue
    }
    if (arg === "--template") {
      const value = args[index + 1]
      if (!value) throw new Error("--template requires a template id.")
      templateIds.add(value)
      index += 1
      continue
    }
    if (arg?.startsWith("--template=")) {
      templateIds.add(arg.slice("--template=".length))
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    force,
    keepTemp,
    templateIds: templateIds.size > 0 ? templateIds : null,
  }
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

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function previewSizeFor(template: RippleTemplateDefinition): PreviewSize {
  const scale = Math.min(1, maxPreviewDimension / Math.max(template.width, template.height))
  return {
    width: even(template.width * scale),
    height: even(template.height * scale),
    scale,
  }
}

function aspectRatioPresetFor(template: RippleTemplateDefinition): "wide-16-9" | "square-1-1" | "vertical-9-16" {
  if (template.width === template.height) return "square-1-1"
  return template.width > template.height ? "wide-16-9" : "vertical-9-16"
}

function slugFor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "template"
}

function projectRecord(projectPath: string): Record<string, unknown> {
  return {
    id: "preview-project",
    name: "Preview Project",
    slug: "preview-project",
    localPath: projectPath,
    path: projectPath,
    aspectRatioPreset: "wide-16-9",
    activeCompositionId: null,
    templateId: "blank",
    setupStatus: "ready",
    setupError: null,
    lastSetupCheckAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    gitRemoteUrl: null,
    gitProvider: null,
    gitOwner: null,
    gitRepo: null,
    iconPath: null,
  }
}

async function writeBaseProject(projectPath: string, size: PreviewSize): Promise<void> {
  await mkdir(join(projectPath, "assets", "vendor"), { recursive: true })
  await writeFile(
    join(projectPath, "index.html"),
    `<!doctype html><main data-composition-id="main" data-width="${size.width}" data-height="${size.height}"></main>\n`,
    "utf8",
  )
  await writeFile(
    join(projectPath, "hyperframes.json"),
    `${JSON.stringify({
      name: "Template Preview",
      entry: "index.html",
      width: size.width,
      height: size.height,
      fps: previewFps,
      compositions: ["index.html"],
    }, null, 2)}\n`,
    "utf8",
  )
}

function previewWrapperHtml(input: {
  template: RippleTemplateDefinition
  installedPath: string
  size: PreviewSize
}): string {
  const duration = input.template.durationSeconds
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${input.template.name} Preview</title>
    <style>
      html,
      body {
        width: ${input.size.width}px;
        height: ${input.size.height}px;
        margin: 0;
        overflow: hidden;
        background: ${input.template.visual.background};
      }

      main {
        position: relative;
        width: ${input.size.width}px;
        height: ${input.size.height}px;
        overflow: hidden;
        background: ${input.template.visual.background};
      }

      .preview-scale {
        position: absolute;
        left: 0;
        top: 0;
        width: ${input.template.width}px;
        height: ${input.template.height}px;
        transform: scale(${input.size.scale});
        transform-origin: left top;
      }
    </style>
  </head>
  <body>
    <main
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${input.size.width}"
      data-height="${input.size.height}"
    >
      <div
        class="preview-scale"
        data-composition-id="${input.template.id}"
        data-composition-src="${input.installedPath}"
        data-start="0"
        data-duration="${duration}"
        data-track-index="1"
        data-width="${input.template.width}"
        data-height="${input.template.height}"
      ></div>
    </main>
  </body>
</html>
`
}

async function prepareProjectTemplatePreview(input: {
  projectPath: string
  template: RippleTemplateDefinition
  size: PreviewSize
}): Promise<void> {
  await installRippleProjectTemplate({
    projectPath: input.projectPath,
    metadata: {
      projectName: input.template.name,
      slug: slugFor(input.template.id),
      aspectRatioPreset: aspectRatioPresetFor(input.template),
      templateId: input.template.id,
      width: input.size.width,
      height: input.size.height,
      fps: previewFps,
    },
  })
}

async function prepareCompositionTemplatePreview(input: {
  projectPath: string
  template: RippleTemplateDefinition
  size: PreviewSize
}): Promise<void> {
  await writeBaseProject(input.projectPath, input.size)

  const installed = await installCompositionTemplateFiles({
    context: {
      key: "template-preview",
      projectId: "preview-project",
      project: projectRecord(input.projectPath) as never,
      projectPath: input.projectPath,
    },
    templateId: input.template.id,
  })

  await writeFile(
    join(input.projectPath, "index.html"),
    previewWrapperHtml({
      template: input.template,
      installedPath: installed.filePath,
      size: input.size,
    }),
    "utf8",
  )
  await writeFile(
    join(input.projectPath, "hyperframes.json"),
    `${JSON.stringify({
      name: `${input.template.name} Preview`,
      entry: "index.html",
      width: input.size.width,
      height: input.size.height,
      fps: previewFps,
      duration: input.template.durationSeconds,
      compositions: [
        "index.html",
        {
          name: input.template.name,
          filePath: installed.filePath,
          dataCompositionId: installed.dataCompositionId,
          width: input.template.width,
          height: input.template.height,
          kind: "external",
          parentDataCompositionId: "main",
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  )
}

async function renderPreview(projectPath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bunx", [
      "hyperframes",
      "render",
      projectPath,
      "--quality",
      "draft",
      "--fps",
      String(previewFps),
      "-o",
      outputPath,
      "--workers",
      "1",
      "--quiet",
    ], {
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`HyperFrames render exited with code ${code ?? "unknown"}.`))
    })
  })
}

async function extractPreviewPoster(input: {
  videoPath: string
  destination: string
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(previewPosterSeekSeconds),
      "-i",
      input.videoPath,
      "-frames:v",
      "1",
      input.destination,
    ], {
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`FFmpeg poster extraction exited with code ${code ?? "unknown"}.`))
    })
  })
}

async function renderTemplatePreview(input: {
  template: RippleTemplateDefinition
  destination: string
  keepTemp: boolean
}): Promise<void> {
  const projectPath = await mkdtemp(join(tmpdir(), `ripple-template-preview-${input.template.id}-`))
  const outputPath = join(projectPath, `${input.template.id}.mp4`)
  const size = previewSizeFor(input.template)

  try {
    if (input.template.sourceKind === "ripple-blank") {
      await prepareProjectTemplatePreview({ projectPath, template: input.template, size })
    } else {
      await prepareCompositionTemplatePreview({ projectPath, template: input.template, size })
    }

    await renderPreview(projectPath, outputPath)
    await mkdir(dirname(input.destination), { recursive: true })
    await rename(outputPath, input.destination)
  } finally {
    if (!input.keepTemp) {
      await rm(projectPath, { recursive: true, force: true })
    } else {
      console.log(`Kept temp preview project: ${projectPath}`)
    }
  }
}

function previewVideoPathFor(template: RippleTemplateDefinition): string {
  return `${previewVideoDirectory}/${template.id}.mp4`
}

function previewProjectPosterPathFor(template: RippleTemplateDefinition): string {
  return `${previewProjectPosterDirectory}/${template.id}.png`
}

async function ensureProjectPreviewPoster(input: {
  template: RippleTemplateDefinition
  videoPath: string
  force: boolean
}): Promise<void> {
  if (input.template.sourceKind !== "ripple-blank") return

  const destination = join(bundleRoot, previewProjectPosterPathFor(input.template))
  if (!input.force && await pathExists(destination)) return

  await mkdir(dirname(destination), { recursive: true })
  await extractPreviewPoster({
    videoPath: input.videoPath,
    destination,
  })
}

async function updateManifestPreviewPaths(catalog: RippleTemplateCatalog): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RippleTemplateManifest
  const expectedVideoPaths = new Map(
    catalog.templates.map((template) => [template.id, previewVideoPathFor(template)]),
  )
  const expectedProjectPosterPaths = new Map(
    catalog.templates
      .filter((template) => template.sourceKind === "ripple-blank")
      .map((template) => [template.id, previewProjectPosterPathFor(template)]),
  )

  manifest.templates = manifest.templates.map((template) => ({
    ...template,
    previewPosterPath: expectedProjectPosterPaths.get(template.id) ?? template.previewPosterPath,
    previewVideoPath: expectedVideoPaths.get(template.id) ?? template.previewVideoPath ?? null,
  }))
  manifest.generatedAt = new Date().toISOString()
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

async function assertEveryRequestedPreviewMediaExists(templates: RippleTemplateDefinition[]): Promise<void> {
  const missing: string[] = []
  for (const template of templates) {
    const expectedPaths = [previewVideoPathFor(template)]
    if (template.sourceKind === "ripple-blank") {
      expectedPaths.push(previewProjectPosterPathFor(template))
    }

    for (const relativePath of expectedPaths) {
      if (!(await pathExists(join(bundleRoot, relativePath)))) {
        missing.push(`${template.id} -> ${relativePath}`)
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing rendered preview media:\n${missing.join("\n")}`)
  }
}

async function main(): Promise<void> {
  const options = parseOptions()
  const catalog = await loadRippleTemplateCatalog({ bundleRoot })
  const templates = options.templateIds
    ? catalog.templates.filter((template) => options.templateIds?.has(template.id))
    : catalog.templates

  if (options.templateIds && templates.length !== options.templateIds.size) {
    const found = new Set(templates.map((template) => template.id))
    const missing = [...options.templateIds].filter((id) => !found.has(id))
    throw new Error(`Unknown template id(s): ${missing.join(", ")}`)
  }

  for (const [index, template] of templates.entries()) {
    const relativePath = previewVideoPathFor(template)
    const destination = join(bundleRoot, relativePath)
    const alreadyRendered = await pathExists(destination)

    if (alreadyRendered && !options.force) {
      console.log(`[${index + 1}/${templates.length}] ${template.id}: keeping ${relativePath}`)
    } else {
      console.log(`[${index + 1}/${templates.length}] ${template.id}: rendering ${relativePath}`)
      await renderTemplatePreview({
        template,
        destination,
        keepTemp: options.keepTemp,
      })
    }

    await ensureProjectPreviewPoster({
      template,
      videoPath: destination,
      force: options.force,
    })
  }

  await assertEveryRequestedPreviewMediaExists(templates)
  if (!options.templateIds || options.templateIds.size === catalog.templates.length) {
    await assertEveryRequestedPreviewMediaExists(catalog.templates)
    await updateManifestPreviewPaths(catalog)
  } else {
    console.log("Rendered selected template previews only; manifest was not updated.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
