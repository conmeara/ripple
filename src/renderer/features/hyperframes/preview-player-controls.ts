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

const PREVIEW_TIMECODE_FALLBACK_FPS = 30
const PREVIEW_LAYOUT_FALLBACK_WIDTH = 16
const PREVIEW_LAYOUT_FALLBACK_HEIGHT = 9

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

const PREVIEW_SPACEBAR_RESERVED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "a[href]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='textbox']",
  "[data-preview-spacebar-ignore]",
].join(",")

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

function isReservedSpacebarTarget(target: EventTarget | null | undefined): boolean {
  const maybeEditable = target as { isContentEditable?: boolean } | null | undefined
  if (maybeEditable?.isContentEditable) return true

  return Boolean(
    getTargetElement(target)?.closest(PREVIEW_SPACEBAR_RESERVED_TARGET_SELECTOR),
  )
}

export function shouldTogglePreviewPlaybackForSpacebar(
  event: PreviewPlaybackKeyboardShortcutEvent,
): boolean {
  const isSpacebar = event.code === "Space" || event.key === " " || event.key === "Spacebar"
  if (!isSpacebar) return false
  if (event.defaultPrevented || event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

  return !isReservedSpacebarTarget(event.target)
}
