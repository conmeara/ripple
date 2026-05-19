import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm } from "node:fs/promises"
import { isAbsolute, join, normalize } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { resolveProducerBrowserPath } from "../hyperframes/runtime"
import { VisualContextError } from "./errors"
import {
  closeVisualProjectServer,
  resolveVisualProjectFile,
  serveVisualProject,
  type VisualProjectServerHandle,
} from "./project-server"

export interface VisualFastBrowserCaptureResult {
  framePaths: string[]
  cleanupPaths?: string[]
}

export interface VisualFastBrowserCaptureInput {
  projectDir: string
  compositionPath?: string | null
  timestampsMs: number[]
  timeoutMs: number
  columns: number
  maxSheetWidth: number
  settleMs: number
  env: NodeJS.ProcessEnv
  repoRoot?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeProjectRelativePath(path: string): string {
  const normalized = normalize(path).replace(/\\/g, "/").replace(/^\/+/, "")
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    isAbsolute(normalized) ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new VisualContextError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
  }
  return normalized
}

async function readProjectTextFile(projectDir: string, projectRelativePath: string): Promise<string | null> {
  const resolved = await resolveVisualProjectFile(projectDir, projectRelativePath)
  if (!resolved.ok) {
    if (resolved.status === 404) return null
    throw new VisualContextError("PROJECT_PATH_ESCAPE", "Project file path escapes the project.")
  }
  return readFile(resolved.path, "utf8")
}

async function readProjectMetadata(projectDir: string, compositionPath?: string | null): Promise<{
  entry: string
  width: number
  height: number
}> {
  let entry = compositionPath?.trim()
    ? normalizeProjectRelativePath(compositionPath.trim())
    : "index.html"
  let width = 1920
  let height = 1080

  try {
    const metadataJson = await readProjectTextFile(projectDir, "hyperframes.json")
    const parsed = metadataJson ? JSON.parse(metadataJson) : null
    if (isRecord(parsed)) {
      if (!compositionPath?.trim() && typeof parsed.entry === "string" && parsed.entry.trim()) {
        entry = normalizeProjectRelativePath(parsed.entry.trim())
      }
      if (typeof parsed.width === "number" && Number.isFinite(parsed.width) && parsed.width > 0) {
        width = Math.round(parsed.width)
      }
      if (typeof parsed.height === "number" && Number.isFinite(parsed.height) && parsed.height > 0) {
        height = Math.round(parsed.height)
      }
    }
  } catch (error) {
    if (error instanceof VisualContextError) throw error
    // Fall back to HyperFrames defaults when metadata is absent or malformed.
  }

  try {
    const html = await readProjectTextFile(projectDir, entry)
    if (!html) return { entry, width, height }
    const widthMatch = /\bdata-width=["'](\d+(?:\.\d+)?)["']/.exec(html)
    const heightMatch = /\bdata-height=["'](\d+(?:\.\d+)?)["']/.exec(html)
    const htmlWidth = widthMatch ? Number(widthMatch[1]) : NaN
    const htmlHeight = heightMatch ? Number(heightMatch[1]) : NaN
    if (Number.isFinite(htmlWidth) && htmlWidth > 0) width = Math.round(htmlWidth)
    if (Number.isFinite(htmlHeight) && htmlHeight > 0) height = Math.round(htmlHeight)
  } catch (error) {
    if (error instanceof VisualContextError) throw error
    // The later browser load will report the missing file with more context.
  }

  return { entry, width, height }
}

export function withBundledWsFallbacks(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    WS_NO_BUFFER_UTIL: env.WS_NO_BUFFER_UTIL ?? "1",
    WS_NO_UTF_8_VALIDATE: env.WS_NO_UTF_8_VALIDATE ?? "1",
  }
}

function applyBundledWsFallbacksToProcess(): () => void {
  const previousBufferUtil = process.env.WS_NO_BUFFER_UTIL
  const previousUtf8Validate = process.env.WS_NO_UTF_8_VALIDATE

  process.env.WS_NO_BUFFER_UTIL = previousBufferUtil ?? "1"
  process.env.WS_NO_UTF_8_VALIDATE = previousUtf8Validate ?? "1"

  return () => {
    if (previousBufferUtil === undefined) {
      delete process.env.WS_NO_BUFFER_UTIL
    } else {
      process.env.WS_NO_BUFFER_UTIL = previousBufferUtil
    }
    if (previousUtf8Validate === undefined) {
      delete process.env.WS_NO_UTF_8_VALIDATE
    } else {
      process.env.WS_NO_UTF_8_VALIDATE = previousUtf8Validate
    }
  }
}

async function loadCapturePage(input: {
  page: any
  url: string
  timeoutMs: number
}): Promise<void> {
  await input.page.goto(input.url, {
    waitUntil: "domcontentloaded",
    timeout: Math.max(5_000, input.timeoutMs),
  })
  await input.page.waitForFunction(
    () => {
      const win = window as any
      return Boolean(
        win.__playerReady ||
        win.__player ||
        win.__timelines ||
        document.querySelector("[data-composition-id]"),
      )
    },
    { timeout: Math.max(1_000, input.timeoutMs) },
  )
}

function isAllowedCaptureRequestUrl(url: string, allowedOrigin: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.origin === allowedOrigin ||
      parsed.protocol === "data:" ||
      parsed.protocol === "blob:" ||
      parsed.protocol === "about:"
  } catch {
    return false
  }
}

async function restrictCapturePageRequests(input: {
  page: any
  allowedOrigin: string
}): Promise<void> {
  await input.page.setRequestInterception(true)
  input.page.on("request", (request: any) => {
    if (typeof request.isInterceptResolutionHandled === "function" && request.isInterceptResolutionHandled()) {
      return
    }
    if (isAllowedCaptureRequestUrl(request.url(), input.allowedOrigin)) {
      void request.continue().catch(() => undefined)
      return
    }
    void request.abort().catch(() => undefined)
  })
}

export async function captureFramesWithFastBrowser(
  input: VisualFastBrowserCaptureInput,
): Promise<VisualFastBrowserCaptureResult> {
  const browserPath = resolveProducerBrowserPath(input.repoRoot)
  if (!browserPath) {
    throw new VisualContextError(
      "FAST_BROWSER_MISSING",
      "Ripple could not find an app-managed browser for fast frame capture.",
    )
  }

  const metadata = await readProjectMetadata(input.projectDir, input.compositionPath)
  const cellWidth = Math.max(160, Math.floor(input.maxSheetWidth / input.columns))
  const cellHeight = Math.max(90, Math.round(cellWidth * (metadata.height / metadata.width)))
  const captureDir = join(
    input.projectDir,
    ".ripple",
    "frame-sheets",
    `.fast-capture-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  )
  await mkdir(captureDir, { recursive: true })

  let servedProject: VisualProjectServerHandle | null = null
  let browser: any = null
  const restoreWsFallbacks = applyBundledWsFallbacksToProcess()
  try {
    const puppeteer = await import("puppeteer-core")
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath: browserPath,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
      env: withBundledWsFallbacks(input.env),
    })

    const page = await browser.newPage()
    await page.setViewport({
      width: cellWidth,
      height: cellHeight,
      deviceScaleFactor: 1,
    })
    servedProject = await serveVisualProject({
      projectDir: input.projectDir,
      entry: metadata.entry,
      repoRoot: input.repoRoot,
    })
    await restrictCapturePageRequests({
      page,
      allowedOrigin: servedProject.origin,
    })
    await loadCapturePage({
      page,
      url: servedProject.url,
      timeoutMs: input.timeoutMs,
    })
    await page.evaluate((dimensions: {
      sourceWidth: number
      sourceHeight: number
      targetWidth: number
      targetHeight: number
    }) => {
      const { sourceWidth, sourceHeight, targetWidth, targetHeight } = dimensions
      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
      document.documentElement.style.width = `${targetWidth}px`
      document.documentElement.style.height = `${targetHeight}px`
      document.documentElement.style.overflow = "hidden"
      document.body.style.width = `${sourceWidth}px`
      document.body.style.height = `${sourceHeight}px`
      document.body.style.overflow = "hidden"
      document.body.style.transformOrigin = "0 0"
      document.body.style.transform = `scale(${scale})`
      const root = document.querySelector<HTMLElement>("[data-composition-id][data-width][data-height]")
      if (root) {
        root.style.width = `${sourceWidth}px`
        root.style.height = `${sourceHeight}px`
        if (!root.style.position) root.style.position = "relative"
        root.style.overflow = "hidden"
      }
    }, {
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      targetWidth: cellWidth,
      targetHeight: cellHeight,
    })

    const framePaths: string[] = []
    for (const [index, timeMs] of input.timestampsMs.entries()) {
      const seconds = timeMs / 1000
      await page.evaluate((time: number) => {
        const win = window as any
        if (win.__player?.seek) {
          win.__player.seek(time)
          return
        }
        const timelines = win.__timelines
        if (!timelines) return
        for (const key of Object.keys(timelines)) {
          const timeline = timelines[key]
          if (!timeline) continue
          if (typeof timeline.pause === "function") timeline.pause()
          if (typeof timeline.totalTime === "function") {
            timeline.totalTime(time, false)
          } else if (typeof timeline.seek === "function") {
            timeline.seek(time, false)
          }
        }
      }, seconds)
      await page.evaluate(() => new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
      }))
      if (input.settleMs > 0) {
        await delay(input.settleMs)
      }
      const framePath = join(captureDir, `${String(index).padStart(3, "0")}.png`)
      await page.screenshot({
        path: framePath,
        type: "png",
        clip: {
          x: 0,
          y: 0,
          width: cellWidth,
          height: cellHeight,
        },
      })
      framePaths.push(framePath)
    }

    return {
      framePaths,
      cleanupPaths: [captureDir],
    }
  } catch (error) {
    await rm(captureDir, { recursive: true, force: true }).catch(() => undefined)
    if (error instanceof VisualContextError) throw error
    throw new VisualContextError(
      "FAST_CAPTURE_FAILED",
      error instanceof Error ? `Fast frame capture failed: ${error.message}` : "Fast frame capture failed.",
    )
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    if (servedProject) {
      await closeVisualProjectServer(servedProject.server).catch(() => undefined)
    }
    restoreWsFallbacks()
  }
}
