export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const ZOOM_OPTIONS = [
  { value: "fit", label: "Fit" },
  { value: "50", label: "50%" },
  { value: "75", label: "75%" },
  { value: "100", label: "100%" },
  { value: "125", label: "125%" },
  { value: "150", label: "150%" },
] as const

export const PREVIEW_SETTINGS_CONTROLS = [
  "zoom",
  "reload-preview",
] as const

export type ZoomValue = (typeof ZOOM_OPTIONS)[number]["value"]
export type PreviewSettingsControl = (typeof PREVIEW_SETTINGS_CONTROLS)[number]
export type PreviewPlayerControlDensity = "full" | "balanced" | "compact" | "minimal"

export interface PreviewPlayerControlLayout {
  density: PreviewPlayerControlDensity
  showLoopControl: boolean
  showSpeedControl: boolean
  showSpeedLabel: boolean
  showMuteControl: boolean
  showRestartControl: boolean
  showFrameStepControls: boolean
  showCaptionControl: boolean
  showTimelineControl: boolean
  showFullscreenControl: boolean
}

export interface PreviewSeekRequestReadiness {
  requestedTime: number | null
  seekRequestId?: number
  settledSeekRequestId: number | null
  isReady: boolean
  isLoadingSource: boolean
  isPreviewSourceFetching: boolean
}

export interface PreviewIssuedSeekRequest {
  issuedSeekRequestId: number | null
  issuedSeekTime: number | null
}

export interface PreviewNavigationHoldInput {
  requestedTime: number | null
  seekRequestId?: number
  settledSeekRequestId: number | null
  isReady: boolean
  isLoadingSource: boolean
  isPreviewSourceFetching: boolean
  currentTime: number
  currentDuration: number
  settledDisplayTime: number
  settledDuration: number
}

export interface PreviewNavigationHoldState {
  hasPendingSeek: boolean
  isPreviewSettling: boolean
  seekTargetTime: number | null
  displayTime: number
  displayDuration: number
  previewControlsReady: boolean
  timelineInteractionsReady: boolean
}

const PREVIEW_TIMECODE_FALLBACK_FPS = 30
const PREVIEW_LAYOUT_FALLBACK_WIDTH = 16
const PREVIEW_LAYOUT_FALLBACK_HEIGHT = 9
const PREVIEW_PLAYER_FULL_CONTROLS_WIDTH = 660
const PREVIEW_PLAYER_BALANCED_CONTROLS_WIDTH = 560
const PREVIEW_PLAYER_COMPACT_CONTROLS_WIDTH = 430
export const PREVIEW_SEEK_SETTLE_EPSILON_SECONDS = 0.0015

export interface PreviewPlaybackKeyboardShortcutEvent {
  key?: string
  code?: string
  repeat?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  defaultPrevented?: boolean
  target?: EventTarget | null
}

const PREVIEW_SPACEBAR_TEXT_ENTRY_TARGET_SELECTOR = [
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='searchbox']",
  "[role='textbox']",
  "[data-preview-spacebar-ignore]",
].join(",")

const PREVIEW_SPACEBAR_NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

export function shouldRenderPreviewCloseControl(
  onClose: (() => void) | null | undefined,
): boolean {
  return typeof onClose === "function"
}

export function formatPreviewTimecode(
  seconds: number,
  fps = PREVIEW_TIMECODE_FALLBACK_FPS,
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00:00"
  const safeFps =
    Number.isFinite(fps) && fps > 0 ? Math.round(fps) : PREVIEW_TIMECODE_FALLBACK_FPS
  const totalFrames = Math.max(0, Math.round(seconds * safeFps))
  const frames = totalFrames % safeFps
  const totalSeconds = Math.floor(totalFrames / safeFps)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  return [
    hours,
    minutes,
    remainingSeconds,
    frames,
  ]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
}

export function fitPreviewStageSize(input: {
  containerWidth: number
  containerHeight: number
  sourceWidth: number
  sourceHeight: number
  zoom: ZoomValue
}): { width: number; height: number } | null {
  const containerWidth = Number.isFinite(input.containerWidth)
    ? Math.max(0, input.containerWidth)
    : 0
  const containerHeight = Number.isFinite(input.containerHeight)
    ? Math.max(0, input.containerHeight)
    : 0
  if (containerWidth <= 0 || containerHeight <= 0) return null

  const sourceWidth = Number.isFinite(input.sourceWidth) && input.sourceWidth > 0
    ? input.sourceWidth
    : PREVIEW_LAYOUT_FALLBACK_WIDTH
  const sourceHeight = Number.isFinite(input.sourceHeight) && input.sourceHeight > 0
    ? input.sourceHeight
    : PREVIEW_LAYOUT_FALLBACK_HEIGHT
  const fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)
  const zoomScale = input.zoom === "fit" ? 1 : Number(input.zoom) / 100
  const scale = Math.max(0.01, fitScale * zoomScale)

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  }
}

export function getPreviewPlayerControlLayout(width: number): PreviewPlayerControlLayout {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : PREVIEW_PLAYER_FULL_CONTROLS_WIDTH

  if (safeWidth >= PREVIEW_PLAYER_FULL_CONTROLS_WIDTH) {
    return {
      density: "full",
      showLoopControl: true,
      showSpeedControl: true,
      showSpeedLabel: true,
      showMuteControl: true,
      showRestartControl: true,
      showFrameStepControls: true,
      showCaptionControl: true,
      showTimelineControl: true,
      showFullscreenControl: true,
    }
  }

  if (safeWidth >= PREVIEW_PLAYER_BALANCED_CONTROLS_WIDTH) {
    return {
      density: "balanced",
      showLoopControl: true,
      showSpeedControl: true,
      showSpeedLabel: true,
      showMuteControl: true,
      showRestartControl: false,
      showFrameStepControls: false,
      showCaptionControl: true,
      showTimelineControl: true,
      showFullscreenControl: true,
    }
  }

  if (safeWidth >= PREVIEW_PLAYER_COMPACT_CONTROLS_WIDTH) {
    return {
      density: "compact",
      showLoopControl: false,
      showSpeedControl: false,
      showSpeedLabel: false,
      showMuteControl: true,
      showRestartControl: false,
      showFrameStepControls: false,
      showCaptionControl: false,
      showTimelineControl: false,
      showFullscreenControl: true,
    }
  }

  return {
    density: "minimal",
    showLoopControl: false,
    showSpeedControl: false,
    showSpeedLabel: false,
    showMuteControl: false,
    showRestartControl: false,
    showFrameStepControls: false,
    showCaptionControl: false,
    showTimelineControl: false,
    showFullscreenControl: false,
  }
}

function canUsePreviewSeekRequest(input: PreviewSeekRequestReadiness): boolean {
  return (
    input.requestedTime !== null &&
    typeof input.seekRequestId === "number" &&
    input.settledSeekRequestId !== input.seekRequestId &&
    input.isReady &&
    !input.isLoadingSource
  )
}

function safePreviewTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function safePreviewDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function resolvePreviewSeekRequestTime(input: {
  requestedTime: number | null
  duration: number
}): number | null {
  if (input.requestedTime === null || !Number.isFinite(input.requestedTime)) {
    return null
  }

  const requestedTime = safePreviewTime(input.requestedTime)
  const duration = safePreviewDuration(input.duration)
  return duration > 0 ? Math.min(requestedTime, duration) : requestedTime
}

function previewSeekTimesEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= PREVIEW_SEEK_SETTLE_EPSILON_SECONDS
}

export function shouldIssuePreviewSeekRequest(
  input: PreviewSeekRequestReadiness & PreviewIssuedSeekRequest,
): boolean {
  if (!canUsePreviewSeekRequest(input)) return false
  if (input.issuedSeekRequestId !== input.seekRequestId) return true
  return !previewSeekTimesEqual(input.issuedSeekTime, input.requestedTime)
}

export function shouldSettlePreviewSeekRequest(
  input: PreviewSeekRequestReadiness & { currentTime: number },
): boolean {
  if (!canUsePreviewSeekRequest(input)) return false
  return previewSeekTimesEqual(input.currentTime, input.requestedTime)
}

export function resolvePreviewNavigationHold(
  input: PreviewNavigationHoldInput,
): PreviewNavigationHoldState {
  const activeSourceReady =
    input.isReady &&
    !input.isLoadingSource
  const sourceFetchIsBlocking =
    input.isPreviewSourceFetching &&
    !activeSourceReady
  const currentDuration = safePreviewDuration(input.currentDuration)
  const settledDuration = safePreviewDuration(input.settledDuration)
  const seekTargetTime = resolvePreviewSeekRequestTime({
    requestedTime: input.requestedTime,
    duration: activeSourceReady ? currentDuration : 0,
  })
  const hasPendingSeek =
    seekTargetTime !== null &&
    typeof input.seekRequestId === "number" &&
    input.settledSeekRequestId !== input.seekRequestId
  const isPreviewSettling =
    input.isLoadingSource ||
    sourceFetchIsBlocking ||
    hasPendingSeek
  const displayDuration =
    isPreviewSettling && settledDuration > 0 && !activeSourceReady
      ? settledDuration
      : currentDuration
  const displayTime =
    hasPendingSeek && seekTargetTime !== null
      ? seekTargetTime
      : isPreviewSettling && settledDuration > 0
        ? safePreviewTime(input.settledDisplayTime)
        : safePreviewTime(input.currentTime)

  return {
    hasPendingSeek,
    isPreviewSettling,
    seekTargetTime,
    displayTime,
    displayDuration,
    previewControlsReady:
      input.isReady &&
      !input.isLoadingSource &&
      !hasPendingSeek,
    timelineInteractionsReady:
      input.isReady &&
      !input.isLoadingSource &&
      !hasPendingSeek,
  }
}

function getTargetElement(target: EventTarget | null | undefined): Element | null {
  if (!target || typeof target !== "object") return null

  const candidate = target as Partial<Element> & {
    parentElement?: Element | null
  }

  if (typeof candidate.closest === "function") {
    return candidate as Element
  }

  const parentElement = candidate.parentElement
  return parentElement && typeof parentElement.closest === "function"
    ? parentElement
    : null
}

function isTextEntrySpacebarTarget(target: EventTarget | null | undefined): boolean {
  const maybeEditable = target as { isContentEditable?: boolean } | null | undefined
  if (maybeEditable?.isContentEditable) return true

  const targetElement = getTargetElement(target)
  if (!targetElement) return false
  if (targetElement.closest(PREVIEW_SPACEBAR_TEXT_ENTRY_TARGET_SELECTOR)) return true

  const inputElement = targetElement.closest("input") as
    | (HTMLInputElement & { getAttribute?: (name: string) => string | null })
    | null
  if (!inputElement) return false

  const inputType = (
    typeof inputElement.type === "string" && inputElement.type.length > 0
      ? inputElement.type
      : inputElement.getAttribute?.("type") ?? "text"
  ).toLowerCase()

  return !PREVIEW_SPACEBAR_NON_TEXT_INPUT_TYPES.has(inputType)
}

export function shouldTogglePreviewPlaybackForSpacebar(
  event: PreviewPlaybackKeyboardShortcutEvent,
): boolean {
  const isSpacebar = event.code === "Space" || event.key === " " || event.key === "Spacebar"
  if (!isSpacebar) return false
  if (event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

  return !isTextEntrySpacebarTarget(event.target)
}
