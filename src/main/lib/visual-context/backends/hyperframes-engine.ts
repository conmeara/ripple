import { WarmRuntimeCaptureBackend } from "./shared-capture"
import type { VisualCaptureBackend, VisualCaptureFramesRequest, VisualCaptureFramesResult } from "./types"

export class HyperframesEngineVisualBackend implements VisualCaptureBackend {
  readonly id = "engine"
  readonly supportsWarmSession = true
  private readonly runtime = new WarmRuntimeCaptureBackend({
    backend: this.id,
    moduleSpecifier: "@hyperframes/engine",
  })

  captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
    return this.runtime.captureFrames(input)
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

export const hyperframesEngineVisualBackend = new HyperframesEngineVisualBackend()
