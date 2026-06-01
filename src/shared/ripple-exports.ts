export const rippleExportFormats = ["mp4", "mov", "webm", "png-sequence"] as const
export type RippleExportFormat = (typeof rippleExportFormats)[number]

export const rippleExportFpsValues = [24, 30, 60] as const
export type RippleExportFps = (typeof rippleExportFpsValues)[number]

export const rippleExportQualityPresets = ["draft", "standard", "high"] as const
export type RippleExportQualityPreset =
  (typeof rippleExportQualityPresets)[number]

export const rippleExportStatuses = [
  "queued",
  "preparing",
  "running",
  "completed",
  "cancelled",
  "failed",
  "interrupted",
] as const
export type RippleExportStatus = (typeof rippleExportStatuses)[number]

export const rippleExportTerminalStatuses = [
  "completed",
  "cancelled",
  "failed",
  "interrupted",
] as const satisfies readonly RippleExportStatus[]

export interface RippleExportAdvancedSettings {
  workers?: number | "auto" | null
  useGpu?: boolean | null
  hdrMode?: "auto" | "force-hdr" | "force-sdr" | null
  crf?: number | null
  videoBitrate?: string | null
  debug?: boolean | null
}

export interface RippleExportJobView {
  id: string
  projectId: string
  compositionId: string | null
  revisionId: string | null
  sourceContextKey: string
  sourceLabel: string
  label: string
  format: RippleExportFormat
  fps: RippleExportFps
  qualityPreset: RippleExportQualityPreset
  settings: RippleExportAdvancedSettings
  outputPath: string | null
  destinationPath: string | null
  displayPath: string | null
  status: RippleExportStatus
  progress: number
  progressLabel: string | null
  pid: number | null
  stdoutTail: string
  stderrTail: string
  errorMessage: string | null
  outputSizeBytes: number | null
  durationSeconds: number | null
  width: number | null
  height: number | null
  createdAt: Date | null
  updatedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
}

export const rippleExportFormatLabels: Record<RippleExportFormat, string> = {
  mp4: "MP4",
  mov: "MOV",
  webm: "WebM",
  "png-sequence": "PNG sequence",
}

export const rippleExportFormatDescriptions: Record<RippleExportFormat, string> = {
  mp4: "Best for sharing, social posts, and review links.",
  mov: "Best for transparent overlays in editing tools.",
  webm: "Best for transparent browser playback.",
  "png-sequence": "Best for lossless frame delivery to compositing tools.",
}

export const rippleExportQualityLabels: Record<RippleExportQualityPreset, string> = {
  draft: "Draft",
  standard: "Standard",
  high: "High",
}

export const rippleExportStatusLabels: Record<RippleExportStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  running: "Rendering",
  completed: "Complete",
  cancelled: "Cancelled",
  failed: "Failed",
  interrupted: "Interrupted",
}

export function isRippleExportFormat(
  value: unknown,
): value is RippleExportFormat {
  return rippleExportFormats.includes(value as RippleExportFormat)
}

export function isRippleExportQualityPreset(
  value: unknown,
): value is RippleExportQualityPreset {
  return rippleExportQualityPresets.includes(value as RippleExportQualityPreset)
}

export function isRippleExportFps(value: unknown): value is RippleExportFps {
  return rippleExportFpsValues.includes(value as RippleExportFps)
}

export function isRippleExportTerminalStatus(
  status: RippleExportStatus,
): boolean {
  return (rippleExportTerminalStatuses as readonly RippleExportStatus[])
    .includes(status)
}

export function clampRippleExportProgress(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

export function getRippleExportExtension(format: RippleExportFormat): string {
  return format
}

export function isRippleExportDirectoryFormat(
  format: RippleExportFormat,
): boolean {
  return format === "png-sequence"
}

export function getRippleExportDisplayPath(job: {
  destinationPath?: string | null
  outputPath?: string | null
}): string | null {
  return job.destinationPath || job.outputPath || null
}

export function parseRippleExportSettingsJson(
  value: string | null | undefined,
): RippleExportAdvancedSettings {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as RippleExportAdvancedSettings
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function formatRippleExportFileSize(
  bytes: number | null | undefined,
): string | null {
  if (!bytes || bytes <= 0) return null
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

export function formatRippleExportDuration(
  seconds: number | null | undefined,
): string | null {
  if (!seconds || seconds <= 0) return null
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = totalSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}
