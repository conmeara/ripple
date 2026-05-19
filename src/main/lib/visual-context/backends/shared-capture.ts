import { randomUUID } from "node:crypto"
import { mkdir, realpath, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { resolveProducerBrowserPath } from "../../hyperframes/runtime"
import {
  resolveVisualCompositionTarget,
  type VisualCompositionTarget,
} from "../composition-targeting"
import {
  closeVisualProjectServer,
  serveVisualProject,
  type VisualProjectServerHandle,
} from "../project-server"
import type {
  VisualCapturedFrame,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualContextBackendId,
} from "../types"

type RuntimeCaptureModule = {
  createCaptureSession: (...args: any[]) => Promise<any>
  initializeSession: (session: any) => Promise<void>
  captureFrame: (session: any, frameIndex: number, timeSeconds: number) => Promise<{ path: string }>
  closeCaptureSession: (session: any) => Promise<void>
  prepareCaptureSessionForReuse?: (
    session: any,
    outputDir: string,
    onBeforeCapture: null,
  ) => void
  __rippleImportFallback?: "producer-reexport"
}

const runtimeFormats = new Set(["png", "jpeg"])
type RuntimeBackendId = "engine" | "producer-capture"
type RuntimeModuleSpecifier = "@hyperframes/engine" | "@hyperframes/producer"

interface RuntimeSessionEntry {
  key: string
  target: VisualCompositionTarget
  browserPath: string
  served: VisualProjectServerHandle
  runtime: RuntimeCaptureModule
  session: any
  idleTimer: ReturnType<typeof setTimeout> | null
}

export async function importRuntimeCaptureModule(specifier: string): Promise<RuntimeCaptureModule> {
  const importer = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<RuntimeCaptureModule>
  try {
    return await importer(specifier)
  } catch (error) {
    if (specifier !== "@hyperframes/engine") throw error
    const producer = await importer("@hyperframes/producer")
    return {
      ...producer,
      __rippleImportFallback: "producer-reexport",
    }
  }
}

function defaultOutputDir(sourcePath: string, backend: VisualContextBackendId): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 12)
  return join(sourcePath, ".ripple", "visual-context", `${backend}-${id}`)
}

function warmOutputDir(sourcePath: string, backend: VisualContextBackendId): string {
  return join(sourcePath, ".ripple", "visual-context", `${backend}-warm`)
}

function requestBrowserPath(request: VisualCaptureFramesRequest): string | null {
  return request.env?.HYPERFRAMES_BROWSER_PATH ??
    request.env?.PRODUCER_HEADLESS_SHELL_PATH ??
    resolveProducerBrowserPath(request.repoRoot)
}

function runtimeSessionKey(input: {
  backend: RuntimeBackendId
  target: VisualCompositionTarget
  request: VisualCaptureFramesRequest
  browserPath: string
}): string {
  return [
    input.backend,
    input.target.projectRealPath,
    input.target.sourceRealPath,
    input.target.compositionPath,
    input.target.sourceRevisionId ?? "",
    input.request.width,
    input.request.height,
    input.request.fps,
    input.request.format,
    input.request.timeoutMs,
    input.browserPath,
  ].join("\u0000")
}

async function realpathOrNull(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  try {
    return await realpath(path)
  } catch {
    return null
  }
}

function runtimeImportWarnings(runtime: RuntimeCaptureModule): string[] {
  if (runtime.__rippleImportFallback !== "producer-reexport") return []
  return [
    "Direct HyperFrames Engine import was unavailable, so Ripple used Producer's Engine-compatible capture exports.",
  ]
}

async function toCapturedFrame(input: {
  path: string
  index: number
  timeMs: number
  fps: number
  width: number
  height: number
}): Promise<VisualCapturedFrame> {
  const info = await stat(input.path)
  return {
    index: input.index,
    timeMs: input.timeMs,
    frame: Math.round((input.timeMs / 1000) * input.fps),
    path: input.path,
    width: input.width,
    height: input.height,
    sizeBytes: info.size,
  }
}

export async function captureFramesWithRuntimeModule(input: {
  request: VisualCaptureFramesRequest
  backend: "engine" | "producer-capture"
  moduleSpecifier: "@hyperframes/engine" | "@hyperframes/producer"
}): Promise<VisualCaptureFramesResult> {
  if (!runtimeFormats.has(input.request.format)) {
    throw new Error(`${input.backend} visual capture currently supports png and jpeg frames.`)
  }

  const startedAt = performance.now()
  const timings: Record<string, number> = {}
  const warnings: string[] = []
  let served: VisualProjectServerHandle | null = null
  let session: any = null
  let runtime: RuntimeCaptureModule | null = null
  let outputDir: string | null = null

  try {
    const targetStartedAt = performance.now()
    const target = await resolveVisualCompositionTarget({
      projectPath: input.request.projectPath,
      sourcePath: input.request.sourcePath,
      compositionPath: input.request.compositionPath,
      sourceRevisionId: input.request.sourceRevisionId,
      allowMissingSourceFallback: true,
    })
    timings.targetMs = performance.now() - targetStartedAt
    outputDir = input.request.outputDir ?? defaultOutputDir(target.sourcePath, input.backend)
    await mkdir(outputDir, { recursive: true })

    const serveStartedAt = performance.now()
    served = await serveVisualProject({
      projectDir: target.sourcePath,
      entry: target.compositionPath,
      repoRoot: input.request.repoRoot,
    })
    timings.serveMs = performance.now() - serveStartedAt

    const browserPath = requestBrowserPath(input.request)
    if (!browserPath) {
      throw new Error("Ripple could not find an app-managed browser for visual capture.")
    }

    const importStartedAt = performance.now()
    runtime = await importRuntimeCaptureModule(input.moduleSpecifier)
    warnings.push(...runtimeImportWarnings(runtime))
    if (runtime.__rippleImportFallback) {
      timings.runtimeImportFallback = 1
    }
    timings.importMs = performance.now() - importStartedAt

    const sessionStartedAt = performance.now()
    session = await runtime.createCaptureSession(
      served.origin,
      outputDir,
      {
        width: input.request.width,
        height: input.request.height,
        fps: input.request.fps,
        format: input.request.format,
      },
      null,
      {
        chromePath: browserPath,
        forceScreenshot: true,
        playerReadyTimeout: input.request.timeoutMs,
      },
    )
    await runtime.initializeSession(session)
    timings.sessionMs = performance.now() - sessionStartedAt

    const captureStartedAt = performance.now()
    const frames: VisualCapturedFrame[] = []
    for (const [index, timeMs] of input.request.timestampsMs.entries()) {
      const frame = await runtime.captureFrame(session, index, timeMs / 1000)
      frames.push(await toCapturedFrame({
        path: frame.path,
        index,
        timeMs,
        fps: input.request.fps,
        width: input.request.width,
        height: input.request.height,
      }))
    }
    timings.captureMs = performance.now() - captureStartedAt

    return {
      backend: input.backend,
      frames,
      elapsedMs: performance.now() - startedAt,
      timings,
      warnings,
      cleanupPaths: input.request.outputDir ? [] : [outputDir],
    }
  } catch (error) {
    if (outputDir && !input.request.outputDir) {
      await rm(outputDir, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  } finally {
    if (session && runtime) {
      await runtime.closeCaptureSession(session).catch(() => undefined)
    }
    if (served) {
      await closeVisualProjectServer(served.server).catch(() => undefined)
    }
  }
}

export class WarmRuntimeCaptureBackend {
  private readonly backend: RuntimeBackendId
  private readonly moduleSpecifier: RuntimeModuleSpecifier
  private readonly idleTtlMs: number
  private readonly sessions = new Map<string, RuntimeSessionEntry>()

  constructor(input: {
    backend: RuntimeBackendId
    moduleSpecifier: RuntimeModuleSpecifier
    idleTtlMs?: number
  }) {
    this.backend = input.backend
    this.moduleSpecifier = input.moduleSpecifier
    this.idleTtlMs = input.idleTtlMs ?? 90_000
  }

  async warmProject(request: VisualCaptureFramesRequest): Promise<void> {
    if (!runtimeFormats.has(request.format)) {
      throw new Error(`${this.backend} visual capture currently supports png and jpeg frames.`)
    }

    let entry: RuntimeSessionEntry | null = null
    let outputDir: string | null = null

    try {
      const target = await resolveVisualCompositionTarget({
        projectPath: request.projectPath,
        sourcePath: request.sourcePath,
        compositionPath: request.compositionPath,
        sourceRevisionId: request.sourceRevisionId,
        allowMissingSourceFallback: true,
      })
      outputDir = warmOutputDir(target.sourcePath, this.backend)

      const browserPath = requestBrowserPath(request)
      if (!browserPath) {
        throw new Error("Ripple could not find an app-managed browser for visual capture.")
      }

      const key = runtimeSessionKey({
        backend: this.backend,
        target,
        request,
        browserPath,
      })
      const sessionResult = await this.getOrCreateSession({
        key,
        target,
        request,
        outputDir,
        browserPath,
        timings: {},
      })
      entry = sessionResult.entry
      this.armIdleTimer(entry)
    } catch (error) {
      if (entry) {
        await this.removeSession(entry.key)
      } else if (outputDir) {
        await rm(outputDir, { recursive: true, force: true }).catch(() => undefined)
      }
      throw error
    }
  }

  async captureFrames(request: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    if (!runtimeFormats.has(request.format)) {
      throw new Error(`${this.backend} visual capture currently supports png and jpeg frames.`)
    }

    const startedAt = performance.now()
    const timings: Record<string, number> = {}
    const warnings: string[] = []
    let entry: RuntimeSessionEntry | null = null
    let outputDir: string | null = null

    try {
      const targetStartedAt = performance.now()
      const target = await resolveVisualCompositionTarget({
        projectPath: request.projectPath,
        sourcePath: request.sourcePath,
        compositionPath: request.compositionPath,
        sourceRevisionId: request.sourceRevisionId,
        allowMissingSourceFallback: true,
      })
      timings.targetMs = performance.now() - targetStartedAt

      outputDir = request.outputDir ?? defaultOutputDir(target.sourcePath, this.backend)

      const browserPath = requestBrowserPath(request)
      if (!browserPath) {
        throw new Error("Ripple could not find an app-managed browser for visual capture.")
      }

      const key = runtimeSessionKey({
        backend: this.backend,
        target,
        request,
        browserPath,
      })
      const sessionResult = await this.getOrCreateSession({
        key,
        target,
        request,
        outputDir,
        browserPath,
        timings,
      })
      entry = sessionResult.entry
      warnings.push(...runtimeImportWarnings(entry.runtime))
      if (entry.runtime.__rippleImportFallback) {
        timings.runtimeImportFallback = 1
      }
      timings.sessionReused = sessionResult.reused ? 1 : 0

      const prepareStartedAt = performance.now()
      await this.prepareSessionForOutput(entry, outputDir)
      timings.prepareMs = performance.now() - prepareStartedAt

      const captureStartedAt = performance.now()
      const frames: VisualCapturedFrame[] = []
      for (const [index, timeMs] of request.timestampsMs.entries()) {
        const frame = await entry.runtime.captureFrame(entry.session, index, timeMs / 1000)
        frames.push(await toCapturedFrame({
          path: frame.path,
          index,
          timeMs,
          fps: request.fps,
          width: request.width,
          height: request.height,
        }))
      }
      timings.captureMs = performance.now() - captureStartedAt

      this.armIdleTimer(entry)

      return {
        backend: this.backend,
        frames,
        elapsedMs: performance.now() - startedAt,
        timings,
        warnings,
        cleanupPaths: request.outputDir ? [] : [outputDir],
      }
    } catch (error) {
      if (entry) {
        await this.removeSession(entry.key)
      }
      if (outputDir && !request.outputDir) {
        await rm(outputDir, { recursive: true, force: true }).catch(() => undefined)
      }
      throw error
    }
  }

  async invalidateProject(input: { projectPath: string; sourcePath?: string | null }): Promise<void> {
    const [projectRealPath, sourceRealPath] = await Promise.all([
      realpathOrNull(input.projectPath),
      realpathOrNull(input.sourcePath),
    ])
    const removals: Promise<void>[] = []
    for (const entry of this.sessions.values()) {
      if (
        (projectRealPath && entry.target.projectRealPath === projectRealPath) ||
        (sourceRealPath && entry.target.sourceRealPath === sourceRealPath) ||
        entry.target.projectPath === input.projectPath ||
        entry.target.sourcePath === input.sourcePath
      ) {
        removals.push(this.removeSession(entry.key))
      }
    }
    await Promise.all(removals)
  }

  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((key) => this.removeSession(key)))
  }

  getWarmSessionCount(): number {
    return this.sessions.size
  }

  private async getOrCreateSession(input: {
    key: string
    target: VisualCompositionTarget
    request: VisualCaptureFramesRequest
    outputDir: string
    browserPath: string
    timings: Record<string, number>
  }): Promise<{ entry: RuntimeSessionEntry; reused: boolean }> {
    const existing = this.sessions.get(input.key)
    if (existing) {
      this.clearIdleTimer(existing)
      return { entry: existing, reused: true }
    }

    let served: VisualProjectServerHandle | null = null
    let runtime: RuntimeCaptureModule | null = null
    let session: any = null

    try {
      const serveStartedAt = performance.now()
      served = await serveVisualProject({
        projectDir: input.target.sourcePath,
        entry: input.target.compositionPath,
        repoRoot: input.request.repoRoot,
      })
      input.timings.serveMs = performance.now() - serveStartedAt

      const importStartedAt = performance.now()
      runtime = await importRuntimeCaptureModule(this.moduleSpecifier)
      input.timings.importMs = performance.now() - importStartedAt

      const sessionStartedAt = performance.now()
      session = await runtime.createCaptureSession(
        served.origin,
        input.outputDir,
        {
          width: input.request.width,
          height: input.request.height,
          fps: input.request.fps,
          format: input.request.format,
        },
        null,
        {
          chromePath: input.browserPath,
          forceScreenshot: true,
          playerReadyTimeout: input.request.timeoutMs,
        },
      )
      await runtime.initializeSession(session)
      input.timings.sessionMs = performance.now() - sessionStartedAt

      const entry: RuntimeSessionEntry = {
        key: input.key,
        target: input.target,
        browserPath: input.browserPath,
        served,
        runtime,
        session,
        idleTimer: null,
      }
      this.sessions.set(input.key, entry)
      return { entry, reused: false }
    } catch (error) {
      if (session && runtime) {
        await runtime.closeCaptureSession(session).catch(() => undefined)
      }
      if (served) {
        await closeVisualProjectServer(served.server).catch(() => undefined)
      }
      throw error
    }
  }

  private async prepareSessionForOutput(entry: RuntimeSessionEntry, outputDir: string): Promise<void> {
    entry.runtime.prepareCaptureSessionForReuse?.(entry.session, outputDir, null)
    if (!entry.runtime.prepareCaptureSessionForReuse) {
      await mkdir(outputDir, { recursive: true })
      entry.session.outputDir = outputDir
      entry.session.onBeforeCapture = null
    }
  }

  private armIdleTimer(entry: RuntimeSessionEntry): void {
    this.clearIdleTimer(entry)
    entry.idleTimer = setTimeout(() => {
      void this.removeSession(entry.key)
    }, this.idleTtlMs)
    entry.idleTimer.unref?.()
  }

  private clearIdleTimer(entry: RuntimeSessionEntry): void {
    if (!entry.idleTimer) return
    clearTimeout(entry.idleTimer)
    entry.idleTimer = null
  }

  private async removeSession(key: string): Promise<void> {
    const entry = this.sessions.get(key)
    if (!entry) return
    this.sessions.delete(key)
    this.clearIdleTimer(entry)
    await entry.runtime.closeCaptureSession(entry.session).catch(() => undefined)
    await closeVisualProjectServer(entry.served.server).catch(() => undefined)
  }
}
