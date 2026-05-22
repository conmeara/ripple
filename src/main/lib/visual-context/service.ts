import { createVisualCaptureBackend } from "./backend-registry"
import { visualContextMetrics, type VisualContextMetrics } from "./metrics"
import { VisualContextRequestQueue } from "./session-pool"
import type {
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualContextBackendId,
  VisualContextService,
  VisualSnapshotInput,
} from "./types"

const deterministicBackendOrder: VisualContextBackendId[] = [
  "engine",
  "producer-capture",
  "fast-browser",
  "hyperframes-cli",
]

export interface VisualContextServiceOptions {
  backends?: Partial<Record<VisualContextBackendId, VisualCaptureBackend>>
  backendOrder?: VisualContextBackendId[]
  maxActiveSessions?: number
  metrics?: VisualContextMetrics
}

function getRequestBackendOrder(input: {
  preferredBackend?: VisualContextBackendId
  backendOrder: VisualContextBackendId[]
}): VisualContextBackendId[] {
  if (!input.preferredBackend) return input.backendOrder
  return [
    input.preferredBackend,
    ...input.backendOrder.filter((backend) => backend !== input.preferredBackend),
  ]
}

function getIntentBackendOrder(input: {
  request: VisualCaptureFramesRequest
  backendOrder: VisualContextBackendId[]
}): VisualContextBackendId[] {
  if (input.request.intent === "current-frame") {
    return ["preview"]
  }

  const renderBackendOrder = input.backendOrder.filter((backend) => backend !== "preview")
  const preferredBackend =
    input.request.preferredBackend === "preview"
      ? undefined
      : input.request.preferredBackend
  return getRequestBackendOrder({
    preferredBackend,
    backendOrder: renderBackendOrder,
  })
}

function buildSessionKey(input: VisualCaptureFramesRequest): string {
  return [
    input.intent ?? "render",
    input.preferredBackend ?? "auto",
    input.previewSurfaceKey ?? "",
    input.projectPath,
    input.sourcePath ?? input.projectPath,
    input.compositionPath ?? "",
    input.sourceRevisionId ?? "",
    input.width,
    input.height,
    input.fps,
    input.format,
  ].join("\u0000")
}

function fallbackWarning(input: {
  failedBackend: VisualContextBackendId
  nextBackend: VisualContextBackendId
}): string {
  return `Ripple visual capture could not use ${input.failedBackend}, so it used ${input.nextBackend}.`
}

function currentFramePreviewUnavailableError(): Error {
  return new Error("Current-frame visual context requires the live preview backend.")
}

export class RippleVisualContextService implements VisualContextService {
  private readonly queue: VisualContextRequestQueue
  private readonly backends: Partial<Record<VisualContextBackendId, VisualCaptureBackend>>
  private readonly backendOrder: VisualContextBackendId[]
  private readonly metrics: VisualContextMetrics
  private closed = false

  constructor(options: VisualContextServiceOptions = {}) {
    this.queue = new VisualContextRequestQueue({
      maxActive: options.maxActiveSessions ?? 2,
    })
    this.backendOrder = options.backendOrder ?? deterministicBackendOrder
    this.metrics = options.metrics ?? visualContextMetrics
    this.backends = {
      engine: createVisualCaptureBackend("engine") ?? undefined,
      "producer-capture": createVisualCaptureBackend("producer-capture") ?? undefined,
      "fast-browser": createVisualCaptureBackend("fast-browser") ?? undefined,
      "hyperframes-cli": createVisualCaptureBackend("hyperframes-cli") ?? undefined,
      ...options.backends,
    }
  }

  async warmProject(input: Pick<
    VisualCaptureFramesRequest,
    "projectPath" | "sourcePath" | "compositionPath" | "sourceRevisionId" | "fps" | "width" | "height" | "format"
  >): Promise<void> {
    this.assertOpen()
    const warmRequest: VisualCaptureFramesRequest = {
      ...input,
      timestampsMs: [0],
      timeoutMs: 5_000,
      reason: "agent-context",
      intent: "specific-frame",
    }
    const order = this.backendOrder.filter((backend) => backend !== "preview")
    let firstFailure: unknown = null

    for (const backendId of order) {
      const backend = this.backends[backendId]
      if (!backend?.warmProject) continue
      try {
        await this.queue.run(
          buildSessionKey({ ...warmRequest, preferredBackend: backendId }),
          () => backend.warmProject!({
            ...warmRequest,
            preferredBackend: backendId,
          }),
        )
        return
      } catch (error) {
        firstFailure ??= error
      }
    }

    if (firstFailure instanceof Error) throw firstFailure
  }

  async captureSnapshot(input: VisualSnapshotInput): Promise<VisualCaptureFramesResult> {
    return this.captureFrames({
      ...input,
      timestampsMs: [input.timeMs],
      reason: input.reason ?? "snapshot",
    })
  }

  async captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    this.assertOpen()
    return this.queue.run(buildSessionKey(input), () => this.captureFramesWithoutQueue(input))
  }

  async invalidateProject(input: { projectPath: string; sourcePath?: string | null }): Promise<void> {
    this.assertOpen()
    this.metrics.recordInvalidation({
      projectPath: input.projectPath,
      sourcePath: input.sourcePath ?? null,
    })
    await Promise.all(Object.values(this.backends).map((backend) =>
      backend?.invalidateProject?.(input).catch(() => undefined)
    ))
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await Promise.all(Object.values(this.backends).map((backend) =>
      backend?.dispose?.().catch(() => undefined)
    ))
    this.metrics.recordShutdown()
  }

  private async captureFramesWithoutQueue(
    input: VisualCaptureFramesRequest,
  ): Promise<VisualCaptureFramesResult> {
    const order = getIntentBackendOrder({
      request: input,
      backendOrder: this.backendOrder,
    })
    if (input.intent === "current-frame" && !this.backends.preview) {
      const error = currentFramePreviewUnavailableError()
      this.metrics.recordFailure({
        backend: "preview",
        reason: input.reason,
        message: error.message,
      })
      throw error
    }
    let firstFailure: { backend: VisualContextBackendId; error: unknown } | null = null
    let previousFailure: VisualContextBackendId | null = null

    for (const backendId of order) {
      const backend = this.backends[backendId]
      if (!backend) continue
      try {
        const result = await backend.captureFrames({
          ...input,
          preferredBackend: backendId,
        })
        if (previousFailure) {
          const fallbackResult = {
            ...result,
            fallbackFrom: firstFailure?.backend ?? previousFailure,
            warnings: [
              fallbackWarning({
                failedBackend: previousFailure,
                nextBackend: result.backend,
              }),
              ...result.warnings,
            ],
          }
          this.metrics.recordCapture({
            backend: fallbackResult.backend,
            reason: input.reason,
            elapsedMs: fallbackResult.elapsedMs,
            fallbackFrom: fallbackResult.fallbackFrom,
          })
          return fallbackResult
        }
        this.metrics.recordCapture({
          backend: result.backend,
          reason: input.reason,
          elapsedMs: result.elapsedMs,
          fallbackFrom: result.fallbackFrom ?? null,
        })
        return result
      } catch (error) {
        firstFailure ??= { backend: backendId, error }
        previousFailure = backendId
      }
    }

    const failure = firstFailure
    this.metrics.recordFailure({
      backend: failure?.backend ?? null,
      reason: input.reason,
      message: failure?.error instanceof Error
        ? failure.error.message
        : "Ripple visual capture has no available backend.",
    })
    if (failure?.error instanceof Error) {
      throw failure.error
    }
    throw new Error("Ripple visual capture has no available backend.")
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Ripple visual context service is shut down.")
    }
  }
}

export function createVisualContextService(
  options: VisualContextServiceOptions = {},
): RippleVisualContextService {
  return new RippleVisualContextService(options)
}
