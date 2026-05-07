export type RippleTimelineZoomMode = "fit" | "manual"

export interface RippleTimelineComfortState {
  zoomMode: RippleTimelineZoomMode
  manualZoomPercent: number
  scrollLeft: number
}

export const DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE: RippleTimelineComfortState = {
  zoomMode: "fit",
  manualZoomPercent: 125,
  scrollLeft: 0,
}

const STORAGE_PREFIX = "ripple-timeline-comfort"

export function rippleTimelineComfortStorageKey(
  projectId: string,
  compositionId: string,
): string {
  return `${STORAGE_PREFIX}:${projectId}:${compositionId}`
}

function normalizeManualZoomPercent(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(800, Math.max(25, Math.round(value)))
    : DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE.manualZoomPercent
}

function normalizeScrollLeft(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE.scrollLeft
}

export function normalizeRippleTimelineComfortState(
  value: unknown,
): RippleTimelineComfortState {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE }
  }

  const record = value as Partial<RippleTimelineComfortState>
  return {
    zoomMode: record.zoomMode === "manual" ? "manual" : "fit",
    manualZoomPercent: normalizeManualZoomPercent(record.manualZoomPercent),
    scrollLeft: normalizeScrollLeft(record.scrollLeft),
  }
}

export function loadRippleTimelineComfortState(
  projectId: string,
  compositionId: string,
): RippleTimelineComfortState {
  if (typeof window === "undefined") {
    return { ...DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE }
  }

  try {
    const raw = window.localStorage.getItem(
      rippleTimelineComfortStorageKey(projectId, compositionId),
    )
    return normalizeRippleTimelineComfortState(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_RIPPLE_TIMELINE_COMFORT_STATE }
  }
}

export function saveRippleTimelineComfortState(
  projectId: string,
  compositionId: string,
  state: RippleTimelineComfortState,
): void {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    rippleTimelineComfortStorageKey(projectId, compositionId),
    JSON.stringify(normalizeRippleTimelineComfortState(state)),
  )
}
