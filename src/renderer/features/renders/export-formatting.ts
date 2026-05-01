import {
  formatRippleExportDuration,
  formatRippleExportFileSize,
  rippleExportFormatLabels,
  rippleExportQualityLabels,
  rippleExportStatusLabels,
  type RippleExportFormat,
  type RippleExportJobView,
  type RippleExportQualityPreset,
} from "../../../shared/ripple-exports"

export function getExportFormatLabel(format: RippleExportFormat): string {
  return rippleExportFormatLabels[format]
}

export function getExportQualityLabel(
  quality: RippleExportQualityPreset,
): string {
  return rippleExportQualityLabels[quality]
}

export function getExportStatusLabel(job: RippleExportJobView): string {
  if (job.progressLabel && job.status !== "completed") {
    return job.progressLabel
  }
  return rippleExportStatusLabels[job.status]
}

export function getExportFileFacts(job: RippleExportJobView): string {
  const facts = [
    formatRippleExportFileSize(job.outputSizeBytes),
    formatRippleExportDuration(job.durationSeconds),
    job.width && job.height ? `${job.width}x${job.height}` : null,
  ].filter(Boolean)

  return facts.join(" · ")
}

export function getExportPathLabel(path: string | null | undefined): string {
  if (!path) return "Project exports"
  const parts = path.split("/")
  return parts.slice(-2).join("/")
}
