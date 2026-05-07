export type VisualContextBackendId =
  | "preview"
  | "engine"
  | "producer-capture"
  | "fast-browser"
  | "hyperframes-cli"

export type VisualCaptureReason =
  | "comment-frame"
  | "comment-range"
  | "snapshot"
  | "frame-sheet"
  | "agent-context"
  | "qa"

export interface VisualCaptureFramesRequest {
  projectPath: string
  sourcePath?: string | null
  compositionPath?: string | null
  sourceRevisionId?: string | null
  timestampsMs: number[]
  fps: number
  width: number
  height: number
  format: "png" | "jpeg" | "webp"
  timeoutMs: number
  reason: VisualCaptureReason
  outputDir?: string
  repoRoot?: string
  env?: NodeJS.ProcessEnv
  preferredBackend?: VisualContextBackendId
}

export interface VisualCapturedFrame {
  index: number
  timeMs: number
  frame: number
  path: string
  width: number
  height: number
  sizeBytes: number
}

export interface VisualCaptureFramesResult {
  backend: VisualContextBackendId
  frames: VisualCapturedFrame[]
  elapsedMs: number
  timings: Record<string, number>
  warnings: string[]
  cleanupPaths: string[]
  fallbackFrom?: VisualContextBackendId
}

export interface VisualCaptureBackend {
  readonly id: VisualContextBackendId
  readonly supportsWarmSession: boolean
  captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult>
  invalidateProject?(input: { projectPath: string; sourcePath?: string | null }): Promise<void>
  dispose?(): Promise<void>
}

export interface VisualSnapshotInput extends Omit<
  VisualCaptureFramesRequest,
  "timestampsMs" | "reason"
> {
  timeMs: number
  reason?: VisualCaptureReason
}

export interface VisualCurrentFrameSnapshot {
  projectPath: string
  sourcePath?: string | null
  compositionPath?: string | null
  sourceRevisionId?: string | null
  timeMs: number
  fps?: number
  width?: number
  height?: number
}

export interface VisualContextService {
  warmProject(input: Pick<
    VisualCaptureFramesRequest,
    "projectPath" | "sourcePath" | "compositionPath" | "sourceRevisionId" | "fps" | "width" | "height" | "format"
  >): Promise<void>
  captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult>
  captureSnapshot(input: VisualSnapshotInput): Promise<VisualCaptureFramesResult>
  invalidateProject(input: { projectPath: string; sourcePath?: string | null }): Promise<void>
  shutdown(): Promise<void>
}
