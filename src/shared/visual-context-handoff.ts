export const RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION = 1

export interface RippleVisualContextHandoffSnapshot {
  path: string
  timeMs: number
  frame: number
  width: number
  height: number
  backend: string
  elapsedMs: number
}

export interface RippleVisualContextHandoffSheet {
  id: string
  path: string
  manifestPath: string
  sampleCount: number
  summary: string
  backend: string
  elapsedMs: number
}

export interface RippleVisualContextHandoffManifest {
  version: typeof RIPPLE_VISUAL_CONTEXT_HANDOFF_VERSION
  createdAt: number
  projectPath: string
  sourcePath: string | null
  compositionPath: string | null
  snapshot: RippleVisualContextHandoffSnapshot | null
  sheet: RippleVisualContextHandoffSheet | null
}
