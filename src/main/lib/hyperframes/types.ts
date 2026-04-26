import type { ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"
import type { Composition, Project } from "../db/schema"
import type { SetupReport } from "../ripple-projects/types"

export type HyperframesChildProcess = ChildProcessByStdio<null, Readable, Readable>

export type HyperframesCommandSource =
  | "packaged-bin"
  | "repo-bin"
  | "package-script"
  | "package-bin"
  | "global"

export interface HyperframesCommandCandidate {
  command: string
  argsPrefix: string[]
  env: NodeJS.ProcessEnv
  source: HyperframesCommandSource
}

export interface HyperframesResolvedCommand extends HyperframesCommandCandidate {
  version: string | null
}

export interface HyperframesCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  error?: Error
  timedOut?: boolean
}

export interface HyperframesSpawnResult {
  child: HyperframesChildProcess
  command: HyperframesResolvedCommand
  args: string[]
}

export class HyperframesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "HyperframesError"
  }
}

export interface HyperframesProjectContext {
  key: string
  projectId: string
  project: Project
  projectPath: string
}

export interface HyperframesCliComposition {
  id: string
  duration: number | null
  width: number | null
  height: number | null
  elementCount: number | null
  source?: string | null
}

export interface HyperframesCompositionRefreshResult {
  project: Project
  compositions: Composition[]
  cliCompositions: HyperframesCliComposition[]
  command: HyperframesCommandResult
}

export type HyperframesPreviewStatus =
  | "starting"
  | "running"
  | "stopped"
  | "error"

export interface HyperframesPreviewState {
  key: string
  projectId: string
  projectPath: string
  status: HyperframesPreviewStatus
  port: number
  url: string
  pid: number | null
  startedAt: Date
  stoppedAt: Date | null
  stdoutTail: string
  stderrTail: string
  error: string | null
}

export interface HyperframesSnapshotResult {
  projectId: string
  projectPath: string
  paths: string[]
  command: HyperframesCommandResult
}

export const hyperframesRenderFormats = ["mp4", "webm", "mov"] as const
export type HyperframesRenderFormat = (typeof hyperframesRenderFormats)[number]

export const hyperframesRenderQualities = ["draft", "standard", "high"] as const
export type HyperframesRenderQuality = (typeof hyperframesRenderQualities)[number]

export const hyperframesRenderFpsValues = [24, 30, 60] as const
export type HyperframesRenderFps = (typeof hyperframesRenderFpsValues)[number]

export type HyperframesRenderStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "error"

export interface HyperframesRenderState {
  jobId: string
  projectId: string
  projectPath: string
  outputPath: string
  format: HyperframesRenderFormat
  fps: HyperframesRenderFps
  quality: HyperframesRenderQuality
  status: HyperframesRenderStatus
  pid: number | null
  startedAt: Date
  completedAt: Date | null
  stdoutTail: string
  stderrTail: string
  error: string | null
  outputSizeBytes: number | null
}

export interface HyperframesDoctorResult {
  setup: SetupReport
  command: HyperframesCommandResult
}
