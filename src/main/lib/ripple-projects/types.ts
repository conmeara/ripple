import type { Project, Composition } from "../db"

export const aspectRatioPresets = [
  "wide-16-9",
  "square-1-1",
  "vertical-9-16",
] as const

export type AspectRatioPreset = (typeof aspectRatioPresets)[number]

export const defaultRippleProjectSettings = {
  aspectRatioPreset: "wide-16-9",
  width: 1920,
  height: 1080,
  fps: 30,
} as const

export interface RippleVideoSettings {
  width: number
  height: number
  fps: number
}

export type SetupStatus =
  | "unknown"
  | "checking"
  | "ready"
  | "needs_environment"
  | "error"

export type EnvironmentCheckName =
  | "node"
  | "ffmpeg"
  | "ffprobe"
  | "hyperframes"
  | "offlineRuntime"

export type EnvironmentCheckStatus = "ready" | "missing" | "warning" | "error"

export interface EnvironmentCheck {
  name: EnvironmentCheckName
  status: EnvironmentCheckStatus
  label: string
  message: string
  version?: string
}

export interface SetupReport {
  status: SetupStatus
  summary: string | null
  checks: EnvironmentCheck[]
  checkedAt: Date
}

export interface CreateRippleProjectInput {
  name: string
  aspectRatioPreset?: AspectRatioPreset
  width?: number
  height?: number
  fps?: number
  templateId?: string | null
}

export interface OpenExistingRippleProjectInput {
  projectPath: string
}

export interface ScaffoldCompositionMetadata {
  name: string
  filePath: string
  dataCompositionId: string
  width: number
  height: number
  kind: "root" | "external"
  parentDataCompositionId?: string
}

export interface ScaffoldMetadata {
  projectName: string
  slug: string
  aspectRatioPreset: AspectRatioPreset
  templateId: string | null
  width: number
  height: number
  fps: number
}

export interface ScaffoldResult {
  projectPath: string
  compositions: ScaffoldCompositionMetadata[]
}

export interface RippleProjectResult {
  project: Project
  activeComposition: Composition | null
  compositions: Composition[]
  generatedPath: string
  setup: SetupReport
}
