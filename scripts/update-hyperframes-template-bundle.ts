import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

const bundleRoot = join(process.cwd(), "resources", "hyperframes-templates")
const manifestPath = join(bundleRoot, "manifest.json")
const catalogIndexUrl =
  "https://raw.githubusercontent.com/heygen-com/hyperframes/main/docs/public/catalog-index.json"
const registryRoot =
  "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry"

type CatalogKind = "block" | "component"
type BundleFileType = "composition" | "asset" | "metadata" | "snippet"

interface CatalogIndexItem {
  name: string
  type: CatalogKind
  title: string
  description: string
  tags: string[]
  href: string
  preview: string
}

interface RegistryFile {
  path: string
  target: string
  type: string
}

interface RegistryItem {
  name: string
  type: string
  title: string
  description: string
  tags?: string[]
  dimensions?: {
    width?: number
    height?: number
  }
  duration?: number
  files?: RegistryFile[]
}

interface ManifestTemplate {
  id: string
  name: string
  description: string
  category: string
  sourceKind: string
  supportedTargets: Array<"new-project" | "new-composition">
  width: number
  height: number
  fps: number
  durationSeconds: number
  previewPosterPath: string
  previewVideoPath: string | null
  sourceUrl: string
  license: string
  compatibility: string
  version: string
  sourceFiles: Array<{
    source: string
    target: string
    type: BundleFileType
  }>
  requiredAssets: string[]
  visual: {
    eyebrow: string
    title: string
    subtitle: string
    background: string
    surface: string
    accent: string
    ink: string
    secondary: string
    motif: string
  }
}

interface Manifest {
  version: string
  generatedAt: string
  templates: ManifestTemplate[]
}

const socialIds = new Set([
  "instagram-follow",
  "macos-notification",
  "reddit-post",
  "spotify-card",
  "tiktok-follow",
  "x-post",
  "yt-lower-third",
])

const showcaseIds = new Set([
  "app-showcase",
  "apple-money-count",
  "goonvpn-youtube-spot",
  "north-korea-locked-down",
  "nyc-paris-flight",
  "ui-3d-reveal",
])

const blockIds = new Set(["flowchart", "logo-outro"])

const palettes = {
  social: {
    background: "#101114",
    surface: "#20242b",
    accent: "#4f8cff",
    ink: "#ffffff",
    secondary: "#9ca3af",
    motif: "card",
  },
  shader: {
    background: "#050712",
    surface: "#171a35",
    accent: "#7c3aed",
    ink: "#f8fafc",
    secondary: "#67e8f9",
    motif: "burst",
  },
  cssTransition: {
    background: "#08111f",
    surface: "#1f2937",
    accent: "#f59e0b",
    ink: "#f9fafb",
    secondary: "#93c5fd",
    motif: "grid",
  },
  showcase: {
    background: "#06130d",
    surface: "#163d2d",
    accent: "#22c55e",
    ink: "#f8fafc",
    secondary: "#a7f3d0",
    motif: "product",
  },
  data: {
    background: "#0f172a",
    surface: "#1e293b",
    accent: "#38bdf8",
    ink: "#f8fafc",
    secondary: "#cbd5e1",
    motif: "chart",
  },
  effect: {
    background: "#14110f",
    surface: "#2f261f",
    accent: "#f97316",
    ink: "#fff7ed",
    secondary: "#fdba74",
    motif: "grain",
  },
  block: {
    background: "#111827",
    surface: "#293548",
    accent: "#eab308",
    ink: "#f8fafc",
    secondary: "#d1d5db",
    motif: "diagram",
  },
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function writeBundleFile(relativePath: string, content: string | Buffer): Promise<void> {
  const destination = join(bundleRoot, relativePath)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, content)
}

function fileTypeFor(registryType: string): BundleFileType {
  if (registryType === "hyperframes:composition") return "composition"
  if (registryType === "hyperframes:asset") return "asset"
  if (registryType === "hyperframes:snippet") return "snippet"
  return "metadata"
}

function categoryFor(item: CatalogIndexItem): string {
  if (item.type === "component") return "Effects"
  if (socialIds.has(item.name)) return "Social Overlays"
  if (item.name.startsWith("transitions-")) return "CSS Transitions"
  if (item.tags.includes("shader")) return "Shader Transitions"
  if (showcaseIds.has(item.name)) return "Showcases"
  if (item.tags.includes("data") || item.tags.includes("chart")) return "Data"
  if (blockIds.has(item.name)) return "Blocks"
  return "Blocks"
}

function visualFor(item: CatalogIndexItem, category: string): ManifestTemplate["visual"] {
  const palette =
    category === "Social Overlays" ? palettes.social :
    category === "Shader Transitions" ? palettes.shader :
    category === "CSS Transitions" ? palettes.cssTransition :
    category === "Showcases" ? palettes.showcase :
    category === "Data" ? palettes.data :
    category === "Effects" ? palettes.effect :
    palettes.block

  return {
    eyebrow: category,
    title: item.title,
    subtitle: item.description,
    ...palette,
  }
}

function assetTargetFor(templateId: string, sourcePath: string): string {
  const withoutAssetsPrefix = sourcePath.replace(/^assets\//, "")
  return `assets/hyperframes-catalog/${templateId}/${withoutAssetsPrefix}`
}

function parseNumberAttribute(source: string, name: string): number | null {
  const match = source.match(new RegExp(`${name}=["']([0-9.]+)["']`))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

async function getPreviousManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as Manifest
}

async function buildProjectStarters(previous: Manifest): Promise<ManifestTemplate[]> {
  const previousById = new Map(previous.templates.map((template) => [template.id, template]))
  const ids = ["blank"]

  const templates: ManifestTemplate[] = []
  for (const id of ids) {
    const previousTemplate = previousById.get(id)
    if (!previousTemplate) throw new Error(`Missing existing project starter metadata: ${id}`)
    const previewPosterPath = `previews/projects/${id}.png`
    const template: ManifestTemplate = {
      ...previousTemplate,
      previewPosterPath,
      previewVideoPath: previousTemplate.previewVideoPath ?? null,
      version: "0.4.40-ripple.2",
    }
    templates.push(template)
  }

  return templates
}

async function buildCatalogTemplate(
  item: CatalogIndexItem,
  previousById: Map<string, ManifestTemplate>,
): Promise<ManifestTemplate> {
  const registryDirectory = item.type === "component" ? "components" : "blocks"
  const registryItem = await fetchJson<RegistryItem>(
    `${registryRoot}/${registryDirectory}/${item.name}/registry-item.json`,
  )
  await writeBundleFile(
    `catalog/${item.name}/registry-item.json`,
    `${JSON.stringify(registryItem, null, 2)}\n`,
  )

  const previewExtension = extname(new URL(item.preview).pathname) || ".png"
  const previewPosterPath = `previews/catalog/${item.name}${previewExtension}`
  await writeBundleFile(previewPosterPath, await fetchBytes(item.preview))

  const sourceFiles: ManifestTemplate["sourceFiles"] = []
  let demoHtml: string | null = null

  if (item.type === "component") {
    const demoSource = `catalog/${item.name}/demo.html`
    demoHtml = await fetchText(`${registryRoot}/${registryDirectory}/${item.name}/demo.html`)
    await writeBundleFile(demoSource, demoHtml)
    sourceFiles.push({
      source: demoSource,
      target: `compositions/${item.name}.html`,
      type: "composition",
    })
  }

  for (const file of registryItem.files ?? []) {
    const source = `catalog/${item.name}/${file.path}`
    await writeBundleFile(
      source,
      await fetchBytes(`${registryRoot}/${registryDirectory}/${item.name}/${file.path}`),
    )
    const type = fileTypeFor(file.type)
    sourceFiles.push({
      source,
      target: type === "asset" ? assetTargetFor(item.name, file.path) : file.target,
      type,
    })
  }

  const category = categoryFor(item)
  const dimensions = registryItem.dimensions ?? {}
  const width =
    dimensions.width ??
    (demoHtml ? parseNumberAttribute(demoHtml, "data-width") : null) ??
    1920
  const height =
    dimensions.height ??
    (demoHtml ? parseNumberAttribute(demoHtml, "data-height") : null) ??
    1080
  const durationSeconds =
    registryItem.duration ??
    (demoHtml ? parseNumberAttribute(demoHtml, "data-duration") : null) ??
    5

  return {
    id: item.name,
    name: item.title,
    description: item.description,
    category,
    sourceKind: item.type === "component" ? "official-component" : "official-block",
    supportedTargets: ["new-project", "new-composition"],
    width,
    height,
    fps: 30,
    durationSeconds,
    previewPosterPath,
    previewVideoPath: previousById.get(item.name)?.previewVideoPath ?? null,
    sourceUrl: `https://hyperframes.heygen.com${item.href}`,
    license: "Apache-2.0",
    compatibility: "HyperFrames 0.4.x, official catalog source sanitized for local GSAP runtime",
    version: "0.4.40-official-catalog",
    sourceFiles,
    requiredAssets: sourceFiles
      .filter((file) => file.type === "asset")
      .map((file) => file.source),
    visual: visualFor(item, category),
  }
}

async function main(): Promise<void> {
  const previous = await getPreviousManifest()
  const previousById = new Map(previous.templates.map((template) => [template.id, template]))
  const catalogIndex = await fetchJson<CatalogIndexItem[]>(catalogIndexUrl)

  const projectStarters = await buildProjectStarters(previous)
  const catalogTemplates: ManifestTemplate[] = []
  for (const item of catalogIndex) {
    catalogTemplates.push(await buildCatalogTemplate(item, previousById))
  }

  const manifest: Manifest = {
    version: "2026.05.01-full-catalog",
    generatedAt: new Date().toISOString(),
    templates: [...projectStarters, ...catalogTemplates],
  }

  await writeBundleFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`)

  const projectCount = manifest.templates.filter((template) =>
    template.supportedTargets.includes("new-project"),
  ).length
  const compositionCount = manifest.templates.filter((template) =>
    template.supportedTargets.includes("new-composition"),
  ).length

  console.log(
    `Updated HyperFrames template bundle: ${manifest.templates.length} templates, ${projectCount} project starters, ${compositionCount} composition starters.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
