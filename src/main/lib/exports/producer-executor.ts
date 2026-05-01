import {
  buildHyperframesEnvironment,
  resolveProducerBrowserPath,
} from "../hyperframes/runtime"
import { HyperframesError } from "../hyperframes/types"
import type {
  RippleExportAdvancedSettings,
  RippleExportFormat,
  RippleExportFps,
  RippleExportQualityPreset,
} from "../../../shared/ripple-exports"

export type ProducerRenderStatus =
  | "queued"
  | "preprocessing"
  | "rendering"
  | "encoding"
  | "assembling"
  | "complete"
  | "failed"
  | "cancelled"

interface ProducerLogger {
  error(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  debug(message: string, meta?: Record<string, unknown>): void
  isLevelEnabled?(level: "error" | "warn" | "info" | "debug"): boolean
}

interface ProducerRenderConfig {
  fps: 24 | 30 | 60
  quality: "draft" | "standard" | "high"
  format?: "mp4" | "webm" | "mov" | "png-sequence"
  workers?: number
  useGpu?: boolean
  debug?: boolean
  entryFile?: string
  logger?: ProducerLogger
  crf?: number
  videoBitrate?: string
  hdrMode?: "auto" | "force-hdr" | "force-sdr"
}

interface ProducerRenderJob {
  status: ProducerRenderStatus
  progress: number
  currentStage: string
  duration?: number
  totalFrames?: number
  framesRendered?: number
  perfSummary?: {
    compositionDurationSeconds?: number
    resolution: {
      width: number
      height: number
    }
  }
}

interface ProducerModule {
  createRenderJob(config: ProducerRenderConfig): ProducerRenderJob
  executeRenderJob(
    job: ProducerRenderJob,
    projectDir: string,
    outputPath: string,
    onProgress?: (job: ProducerRenderJob, message: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<void>
}

async function loadProducerModule(): Promise<ProducerModule> {
  const importer = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<ProducerModule>
  return importer("@hyperframes/producer")
}

export interface ProducerExportProgress {
  status: ProducerRenderStatus
  progress: number
  label: string
  durationSeconds?: number
  totalFrames?: number
  framesRendered?: number
  width?: number
  height?: number
}

export interface ProducerExportLog {
  level: "error" | "warn" | "info" | "debug"
  message: string
  meta?: Record<string, unknown>
}

export interface ProducerExportResult {
  durationSeconds: number | null
  width: number | null
  height: number | null
}

export interface ProducerExportInput {
  projectDir: string
  entryFile: string
  outputPath: string
  format: RippleExportFormat
  fps: RippleExportFps
  qualityPreset: RippleExportQualityPreset
  settings?: RippleExportAdvancedSettings
  signal?: AbortSignal
  onProgress?: (progress: ProducerExportProgress) => void
  onLog?: (log: ProducerExportLog) => void
}

let renderEnvironmentQueue: Promise<void> = Promise.resolve()

function withAppManagedRenderEnvironment<T>(work: () => Promise<T>): Promise<T> {
  const env = buildHyperframesEnvironment(process.env)
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    if (typeof value === "string") {
      process.env[key] = value
    }
  }

  return work().finally(() => {
    for (const [key, value] of previous) {
      if (typeof value === "string") {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    }
  })
}

async function withSerializedAppManagedRenderEnvironment<T>(
  work: () => Promise<T>,
): Promise<T> {
  const previous = renderEnvironmentQueue
  let release: () => void = () => {}
  renderEnvironmentQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    return await withAppManagedRenderEnvironment(work)
  } finally {
    release()
  }
}

function createExportLogger(
  onLog?: (log: ProducerExportLog) => void,
): ProducerLogger {
  const emit = (
    level: ProducerExportLog["level"],
    message: string,
    meta?: Record<string, unknown>,
  ) => {
    onLog?.({ level, message, meta })
  }

  return {
    error: (message, meta) => emit("error", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    info: (message, meta) => emit("info", message, meta),
    debug: (message, meta) => emit("debug", message, meta),
    isLevelEnabled: (level) => level !== "debug",
  }
}

function buildRenderConfig(input: ProducerExportInput): ProducerRenderConfig {
  const settings = input.settings ?? {}
  const config: ProducerRenderConfig = {
    fps: input.fps,
    quality: input.qualityPreset,
    format: input.format,
    entryFile: input.entryFile,
    logger: createExportLogger(input.onLog),
  }

  if (typeof settings.workers === "number") {
    config.workers = settings.workers
  }
  if (typeof settings.useGpu === "boolean") {
    config.useGpu = settings.useGpu
  }
  if (settings.hdrMode) {
    config.hdrMode = settings.hdrMode
  }
  if (typeof settings.crf === "number") {
    config.crf = settings.crf
  }
  if (settings.videoBitrate) {
    config.videoBitrate = settings.videoBitrate
  }
  if (typeof settings.debug === "boolean") {
    config.debug = settings.debug
  }

  return config
}

function toProgress(
  job: ProducerRenderJob,
  label: string,
): ProducerExportProgress {
  return {
    status: job.status,
    progress: job.progress,
    label,
    durationSeconds: job.duration,
    totalFrames: job.totalFrames,
    framesRendered: job.framesRendered,
    width: job.perfSummary?.resolution.width,
    height: job.perfSummary?.resolution.height,
  }
}

export async function executeProducerExport(
  input: ProducerExportInput,
): Promise<ProducerExportResult> {
  if (!resolveProducerBrowserPath(process.cwd())) {
    throw new HyperframesError(
      "Ripple's export browser is not available in this build.",
      "EXPORT_BROWSER_MISSING",
    )
  }

  const producer = await loadProducerModule()
  const job = producer.createRenderJob(buildRenderConfig(input))

  await withSerializedAppManagedRenderEnvironment(async () => {
    await producer.executeRenderJob(
      job,
      input.projectDir,
      input.outputPath,
      (producerJob, message) => {
        input.onProgress?.(toProgress(producerJob, message))
      },
      input.signal,
    )
  })

  return {
    durationSeconds: job.duration ?? job.perfSummary?.compositionDurationSeconds ?? null,
    width: job.perfSummary?.resolution.width ?? null,
    height: job.perfSummary?.resolution.height ?? null,
  }
}

export function isProducerCancellationError(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderCancelledError"
}
