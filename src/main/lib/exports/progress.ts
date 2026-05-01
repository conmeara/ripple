import {
  clampRippleExportProgress,
  type RippleExportStatus,
} from "../../../shared/ripple-exports"
import type { ProducerRenderStatus } from "./producer-executor"

export function mapProducerStatusToExportStatus(
  status: ProducerRenderStatus,
): RippleExportStatus {
  switch (status) {
    case "queued":
      return "queued"
    case "preprocessing":
      return "preparing"
    case "rendering":
    case "encoding":
    case "assembling":
      return "running"
    case "complete":
      return "completed"
    case "cancelled":
      return "cancelled"
    case "failed":
      return "failed"
  }
}

export function normalizeProgressUpdate(input: {
  status: ProducerRenderStatus
  progress: number
  label: string
}): {
  status: RippleExportStatus
  progress: number
  progressLabel: string
} {
  return {
    status: mapProducerStatusToExportStatus(input.status),
    progress: clampRippleExportProgress(input.progress),
    progressLabel: input.label.trim() || "Rendering",
  }
}

export function trimExportLogTail(value: string, maxLength = 8000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength)
}
