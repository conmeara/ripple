const SEEK_EDGE_SNAP_PX = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolvePreviewSeekRatio(input: {
  clientX: number
  rectLeft: number
  rectWidth: number
}): number {
  if (!Number.isFinite(input.rectWidth) || input.rectWidth <= 0) return 0

  const clamped = clamp((input.clientX - input.rectLeft) / input.rectWidth, 0, 1)
  const snapThreshold = Math.min(0.5, SEEK_EDGE_SNAP_PX / input.rectWidth)
  if (clamped <= snapThreshold) return 0
  if (clamped >= 1 - snapThreshold) return 1
  return clamped
}
