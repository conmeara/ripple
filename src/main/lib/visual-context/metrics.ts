import type { VisualCaptureReason, VisualContextBackendId } from "./types"

export type VisualContextMetricEvent =
  | {
    type: "capture"
    backend: VisualContextBackendId
    reason: VisualCaptureReason
    elapsedMs: number
    fallbackFrom: VisualContextBackendId | null
    createdAt: number
  }
  | {
    type: "failure"
    backend: VisualContextBackendId | null
    reason: VisualCaptureReason | null
    message: string
    createdAt: number
  }
  | {
    type: "invalidation"
    projectPath: string
    sourcePath: string | null
    createdAt: number
  }
  | {
    type: "shutdown"
    createdAt: number
  }

export class VisualContextMetrics {
  private readonly events: VisualContextMetricEvent[] = []

  constructor(private readonly now: () => number = Date.now) {}

  recordCapture(input: {
    backend: VisualContextBackendId
    reason: VisualCaptureReason
    elapsedMs: number
    fallbackFrom?: VisualContextBackendId | null
  }): void {
    this.events.push({
      type: "capture",
      backend: input.backend,
      reason: input.reason,
      elapsedMs: input.elapsedMs,
      fallbackFrom: input.fallbackFrom ?? null,
      createdAt: this.now(),
    })
  }

  recordFailure(input: {
    backend?: VisualContextBackendId | null
    reason?: VisualCaptureReason | null
    message: string
  }): void {
    this.events.push({
      type: "failure",
      backend: input.backend ?? null,
      reason: input.reason ?? null,
      message: input.message,
      createdAt: this.now(),
    })
  }

  recordInvalidation(input: {
    projectPath: string
    sourcePath?: string | null
  }): void {
    this.events.push({
      type: "invalidation",
      projectPath: input.projectPath,
      sourcePath: input.sourcePath ?? null,
      createdAt: this.now(),
    })
  }

  recordShutdown(): void {
    this.events.push({
      type: "shutdown",
      createdAt: this.now(),
    })
  }

  snapshot(): VisualContextMetricEvent[] {
    return [...this.events]
  }
}

export const visualContextMetrics = new VisualContextMetrics()
