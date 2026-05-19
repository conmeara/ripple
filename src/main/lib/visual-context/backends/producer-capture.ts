import { WarmRuntimeCaptureBackend } from "./shared-capture"
import type { VisualCaptureBackend, VisualCaptureFramesRequest, VisualCaptureFramesResult } from "./types"

export class ProducerCaptureVisualBackend implements VisualCaptureBackend {
  readonly id = "producer-capture"
  readonly supportsWarmSession = true
  private readonly runtime = new WarmRuntimeCaptureBackend({
    backend: this.id,
    moduleSpecifier: "@hyperframes/producer",
  })

  captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    return this.runtime.captureFrames(input)
  }

  warmProject(input: VisualCaptureFramesRequest): Promise<void> {
    return this.runtime.warmProject(input)
  }

  invalidateProject(input: { projectPath: string; sourcePath?: string | null }): Promise<void> {
    return this.runtime.invalidateProject(input)
  }

  dispose(): Promise<void> {
    return this.runtime.dispose()
  }

  getWarmSessionCount(): number {
    return this.runtime.getWarmSessionCount()
  }
}

export const producerCaptureVisualBackend = new ProducerCaptureVisualBackend()
