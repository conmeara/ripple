import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, posix } from "node:path"
import type { Composition, Project } from "../db/schema"
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
} from "./project-context"
import type { HyperframesProjectContext } from "./types"
import { HyperframesError } from "./types"

export const HYPERFRAMES_PLAYER_PROTOCOL = "ripple-preview"
export const HYPERFRAMES_PLAYER_RUNTIME_PATH = "__hyperframes/runtime.js"
export const HYPERFRAMES_PLAYER_GSAP_PATH = "__hyperframes/gsap.min.js"
export const HYPERFRAMES_PLAYER_PREVIEW_ROOT_PATH =
  "__hyperframes/preview/index.html"
export const HYPERFRAMES_PLAYER_PREVIEW_COMP_PREFIX =
  "__hyperframes/preview/comp/"

const HYPERFRAMES_RUNTIME_CDN_PATTERN =
  /https:\/\/cdn\.jsdelivr\.net\/npm\/@hyperframes\/core(?:@[^/"']+)?\/dist\/hyperframe\.runtime(?:\.iife)?\.js/g
const GSAP_CDN_PATTERN =
  /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap(?:@[^/"']+)?\/dist\/gsap\.min\.js/g

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

export interface HyperframesPlayerSource {
  sourceUrl: string
  rawSourceUrl: string
  baseHref: string
  runtimeUrl: string
  mode: "url"
  width: number
  height: number
}

function encodeProjectRelativePath(filePath: string): string {
  const normalized = normalizeProjectRelativePath(filePath)
  return normalized.split("/").map(encodeURIComponent).join("/")
}

export function buildHyperframesPlayerSourceUrl(input: {
  projectId: string
  filePath: string
}): string {
  return `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(input.projectId)}/${encodeProjectRelativePath(input.filePath)}`
}

export function buildHyperframesPlayerPreparedPreviewUrl(input: {
  projectId: string
  filePath: string
  kind?: Composition["kind"] | null
}): string {
  const filePath = normalizeProjectRelativePath(input.filePath)
  const previewPath =
    input.kind === "root" && filePath === "index.html"
      ? HYPERFRAMES_PLAYER_PREVIEW_ROOT_PATH
      : `${HYPERFRAMES_PLAYER_PREVIEW_COMP_PREFIX}${filePath}`

  return `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(input.projectId)}/${encodeProjectRelativePath(previewPath)}`
}

export function buildHyperframesPlayerBaseHref(input: {
  projectId: string
  filePath: string
}): string {
  const normalized = normalizeProjectRelativePath(input.filePath)
  const directory = posix.dirname(normalized)
  const prefix = `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(input.projectId)}`

  if (directory === ".") return `${prefix}/`
  return `${prefix}/${directory.split("/").map(encodeURIComponent).join("/")}/`
}

export function buildHyperframesPlayerProjectBaseHref(projectId: string): string {
  return `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(projectId)}/`
}

export function buildHyperframesPlayerRuntimeUrl(projectId: string): string {
  return `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(projectId)}/${HYPERFRAMES_PLAYER_RUNTIME_PATH}`
}

export function buildHyperframesPlayerGsapUrl(projectId: string): string {
  return `${HYPERFRAMES_PLAYER_PROTOCOL}://${encodeURIComponent(projectId)}/${HYPERFRAMES_PLAYER_GSAP_PATH}`
}

export function getHyperframesPlayerMimeType(filePath: string): string {
  return mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream"
}

export function loadHyperframesPlayerRuntimeSource(): string {
  return readFileSync(require.resolve("@hyperframes/core/runtime"), "utf-8")
}

export function loadHyperframesPlayerBundledGsapSource(filePath: string): string | null {
  const normalizedPath = normalizeProjectRelativePath(filePath)
  if (
    normalizedPath !== HYPERFRAMES_PLAYER_GSAP_PATH &&
    normalizedPath !== "assets/vendor/gsap-lite.js"
  ) {
    return null
  }

  return readFileSync(require.resolve("gsap/dist/gsap.min.js"), "utf-8")
}

function formatLegacyFrameSeconds(frameValue: number): string {
  const seconds = frameValue / 30
  return Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

export function upgradeLegacyRippleStarterHtmlForPreview(html: string): string {
  if (!html.includes("gsap-lite.js")) return html

  return html
    .replace(
      /\bdata-(start|duration)=(["'])([0-9]+(?:\.[0-9]+)?)\2/g,
      (match, attribute: string, quote: string, value: string) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue) || numericValue <= 6) return match

        return `data-${attribute}=${quote}${formatLegacyFrameSeconds(numericValue)}${quote}`
      },
    )
}

export function loadHyperframesPlayerLegacyGsapSource(filePath: string): string | null {
  return loadHyperframesPlayerBundledGsapSource(filePath)
}

export function selectHyperframesPlayerComposition(input: {
  project: Project
  compositions: Composition[]
  compositionId?: string | null
}): Composition | null {
  if (input.compositionId) {
    const selected = input.compositions.find(
      (composition) => composition.id === input.compositionId,
    )
    if (!selected) {
      throw new HyperframesError(
        "This composition is no longer available.",
        "COMPOSITION_NOT_FOUND",
      )
    }
    return selected
  }

  return (
    input.compositions.find(
      (composition) => composition.id === input.project.activeCompositionId,
    ) ??
    input.compositions.find((composition) => composition.kind === "root") ??
    input.compositions[0] ??
    null
  )
}

export function injectHyperframesPlayerDocumentChrome(input: {
  html: string
  baseHref: string
  runtimeUrl: string
}): string {
  let html = input.html.replace(HYPERFRAMES_RUNTIME_CDN_PATTERN, input.runtimeUrl)
  const baseTag = `<base href="${input.baseHref}">`
  const runtimeTag = `<script data-hyperframes-preview-runtime="1" src="${input.runtimeUrl}"></script>`

  if (!/<base\s/i.test(html)) {
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`)
      : `${baseTag}\n${html}`
  }

  if (
    !html.includes("hyperframe.runtime") &&
    !html.includes("hyperframes-preview-runtime")
  ) {
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${runtimeTag}\n</body>`)
      : `${html}\n${runtimeTag}`
  }

  return html
}

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|data:|blob:|#|\/)/i.test(value)
}

function rewriteCompositionRelativeUrl(value: string, filePath: string): string {
  if (!value.trim() || isExternalUrl(value)) return value

  const directory = posix.dirname(filePath)
  const candidate = directory === "." ? value : `${directory}/${value}`
  return normalizeProjectRelativePath(candidate)
}

function rewriteCompositionHtmlReferences(html: string, filePath: string): string {
  return html.replace(
    /\b(src|href)=(["'])([^"']+)\2/gi,
    (_match, attribute: string, quote: string, value: string) => {
      try {
        return `${attribute}=${quote}${rewriteCompositionRelativeUrl(value, filePath)}${quote}`
      } catch {
        return `${attribute}=${quote}${value}${quote}`
      }
    },
  ).replace(
    /url\((["']?)([^"')]+)\1\)/gi,
    (_match, quote: string, value: string) => {
      try {
        return `url(${quote}${rewriteCompositionRelativeUrl(value, filePath)}${quote})`
      } catch {
        return `url(${quote}${value}${quote})`
      }
    },
  )
}

function rewriteNestedCompositionSources(html: string, filePath: string): string {
  return html.replace(
    /\bdata-composition-src=(["'])([^"']+)\1/gi,
    (_match, quote: string, value: string) => {
      try {
        return `data-composition-src=${quote}${rewriteCompositionRelativeUrl(value, filePath)}${quote}`
      } catch {
        return `data-composition-src=${quote}${value}${quote}`
      }
    },
  )
}

function replaceKnownRemotePreviewDependencies(input: {
  html: string
  runtimeUrl: string
  gsapUrl: string
}): string {
  return input.html
    .replace(HYPERFRAMES_RUNTIME_CDN_PATTERN, input.runtimeUrl)
    .replace(GSAP_CDN_PATTERN, input.gsapUrl)
}

function extractTemplateContent(html: string): string {
  return html.match(/<template[^>]*>([\s\S]*)<\/template>/i)?.[1] ?? html
}

function extractHeadContent(html: string): string {
  return html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? ""
}

function resolveProjectFile(projectPath: string, filePath: string): string {
  return resolveProjectRelativePath({
    key: "player-source",
    projectId: "player-source",
    project: {} as Project,
    projectPath,
  }, filePath)
}

function buildStandaloneCompositionDocument(input: {
  projectPath: string
  filePath: string
  baseHref: string
  runtimeUrl: string
}): string | null {
  const absolutePath = resolveProjectFile(input.projectPath, input.filePath)
  if (!existsSync(absolutePath)) return null

  const rawComposition = upgradeLegacyRippleStarterHtmlForPreview(
    readFileSync(absolutePath, "utf-8"),
  )
  const content = rewriteCompositionHtmlReferences(
    extractTemplateContent(rawComposition),
    input.filePath,
  )
  const indexPath = resolveProjectFile(input.projectPath, "index.html")
  const head = existsSync(indexPath)
    ? extractHeadContent(readFileSync(indexPath, "utf-8"))
    : ""

  return injectHyperframesPlayerDocumentChrome({
    html: `<!doctype html>
<html>
<head>
${head}
</head>
<body>
<script>window.__timelines=window.__timelines||{};</script>
${content}
</body>
</html>`,
    baseHref: input.baseHref,
    runtimeUrl: input.runtimeUrl,
  })
}

type HyperframesStudioApiModule = typeof import("@hyperframes/core/studio-api")

let hyperframesStudioApiPromise: Promise<HyperframesStudioApiModule> | null = null

function importHyperframesStudioApi(): Promise<HyperframesStudioApiModule> {
  hyperframesStudioApiPromise ??= import("@hyperframes/core/studio-api")
  return hyperframesStudioApiPromise
}

async function buildStudioPreparedCompositionDocument(input: {
  projectPath: string
  filePath: string
  baseHref: string
  runtimeUrl: string
}): Promise<string | null> {
  try {
    const { buildSubCompositionHtml } = await importHyperframesStudioApi()
    return buildSubCompositionHtml(
      input.projectPath,
      input.filePath,
      input.runtimeUrl,
      input.baseHref,
    )
  } catch (error) {
    console.warn("[HyperFramesPlayerSource] Studio preview helper failed:", error)
    return null
  }
}

export async function buildHyperframesPreparedPreviewDocument(input: {
  context: HyperframesProjectContext
  filePath: string
  kind?: Composition["kind"] | null
}): Promise<string> {
  const filePath = normalizeProjectRelativePath(input.filePath)
  const absolutePath = resolveProjectRelativePath(input.context, filePath)

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new HyperframesError(
      "This composition file is missing from the project.",
      "COMPOSITION_FILE_MISSING",
    )
  }

  const baseHref = buildHyperframesPlayerProjectBaseHref(input.context.projectId)
  const runtimeUrl = buildHyperframesPlayerRuntimeUrl(input.context.projectId)
  const gsapUrl = buildHyperframesPlayerGsapUrl(input.context.projectId)
  const isRootDocument = input.kind === "root" && filePath === "index.html"

  if (!isRootDocument) {
    const studioPrepared = await buildStudioPreparedCompositionDocument({
      projectPath: input.context.projectPath,
      filePath,
      baseHref,
      runtimeUrl,
    })

    if (studioPrepared) {
      return replaceKnownRemotePreviewDependencies({
        html: rewriteNestedCompositionSources(
          upgradeLegacyRippleStarterHtmlForPreview(studioPrepared),
          filePath,
        ),
        runtimeUrl,
        gsapUrl,
      })
    }

    const standalone = buildStandaloneCompositionDocument({
      projectPath: input.context.projectPath,
      filePath,
      baseHref,
      runtimeUrl,
    })

    if (standalone) {
      return replaceKnownRemotePreviewDependencies({
        html: rewriteNestedCompositionSources(standalone, filePath),
        runtimeUrl,
        gsapUrl,
      })
    }
  }

  return replaceKnownRemotePreviewDependencies({
    html: injectHyperframesPlayerDocumentChrome({
      html: upgradeLegacyRippleStarterHtmlForPreview(readFileSync(absolutePath, "utf-8")),
      baseHref,
      runtimeUrl,
    }),
    runtimeUrl,
    gsapUrl,
  })
}

export function buildHyperframesPlayerSourceDocument(input: {
  context: HyperframesProjectContext
  composition: Composition
}): HyperframesPlayerSource {
  const filePath = normalizeProjectRelativePath(input.composition.filePath)
  const absolutePath = resolveProjectRelativePath(input.context, filePath)

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new HyperframesError(
      "This composition file is missing from the project.",
      "COMPOSITION_FILE_MISSING",
    )
  }

  const baseHref = buildHyperframesPlayerProjectBaseHref(input.context.projectId)
  const runtimeUrl = buildHyperframesPlayerRuntimeUrl(input.context.projectId)
  const rawSourceUrl = buildHyperframesPlayerSourceUrl({
    projectId: input.context.projectId,
    filePath,
  })
  const sourceUrl = buildHyperframesPlayerPreparedPreviewUrl({
    projectId: input.context.projectId,
    filePath,
    kind: input.composition.kind,
  })

  return {
    sourceUrl,
    rawSourceUrl,
    baseHref,
    runtimeUrl,
    mode: "url",
    width: input.composition.width,
    height: input.composition.height,
  }
}
