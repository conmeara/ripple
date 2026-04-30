export const RIPPLE_PREVIEW_TIME_STICKY_EPSILON_SECONDS = 0.0015

export function normalizeRipplePreviewTime(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0
}

export function shouldKeepStickyRipplePreviewTime(input: {
  currentTime: number
  incomingTime: number
}): boolean {
  const currentTime = normalizeRipplePreviewTime(input.currentTime)
  const incomingTime = normalizeRipplePreviewTime(input.incomingTime)
  return (
    Math.abs(incomingTime - currentTime) <=
    RIPPLE_PREVIEW_TIME_STICKY_EPSILON_SECONDS
  )
}

export function shouldIgnorePendingRipplePreviewTimeUpdate(input: {
  pendingSeekTime: number | null
  incomingTime: number
}): boolean {
  if (input.pendingSeekTime === null) return false

  const pendingSeekTime = normalizeRipplePreviewTime(input.pendingSeekTime)
  const incomingTime = normalizeRipplePreviewTime(input.incomingTime)
  if (
    shouldKeepStickyRipplePreviewTime({
      currentTime: pendingSeekTime,
      incomingTime,
    })
  ) {
    return false
  }

  return (
    pendingSeekTime > RIPPLE_PREVIEW_TIME_STICKY_EPSILON_SECONDS &&
    incomingTime <= RIPPLE_PREVIEW_TIME_STICKY_EPSILON_SECONDS
  )
}
